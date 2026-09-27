import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { eventBus } from "../../shared/event-bus";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import type { MachineEngine } from "../machines/ports";
import type { ProviderEventJob } from "./provider-event-queue";
import type { ProviderEventReceiptStore } from "./provider-event-receipts";
import {
  createMachineEventMapping,
  createProviderEventRegistry,
  type NormalizedProviderEvent,
  PROVIDER_EVENT_NORMALIZED,
  type ProviderEventMapping,
  type ProviderForwardedEvent,
} from "./provider-events";

export interface ProviderEventWorkerDeps {
  machines?: Pick<MachineEngine, "transition" | "getInstance" | "replayPersistedTransition">;
  mappings?: ProviderEventMapping[];
  receipts?: ProviderEventReceiptStore;
}

export function startProviderEventWorker(
  deps: ProviderEventWorkerDeps,
): Worker<ProviderEventJob> | null {
  if (!workersEnabled()) return null;
  const registry = createProviderEventRegistry([
    createMachineEventMapping(),
    ...(deps.mappings ?? []),
  ]);
  return new Worker<ProviderEventJob>(
    BULLMQ_QUEUES.PROVIDER_EVENTS,
    async (job) => processProviderEventJob(job.data.event, deps, registry),
    {
      connection: getRedisConnection(),
      concurrency: workerConcurrency("PROVIDER_EVENT_WORKER_CONCURRENCY", 8),
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
}

export async function processProviderEventJob(
  event: ProviderForwardedEvent,
  deps: ProviderEventWorkerDeps,
  registry = createProviderEventRegistry([createMachineEventMapping(), ...(deps.mappings ?? [])]),
): Promise<void> {
  try {
    await eventBus.publish("provider.event.received", event);
    const normalized = registry.normalize(event);
    if (normalized) {
      await eventBus.publish(PROVIDER_EVENT_NORMALIZED, normalized);
      if (normalized.machineInstanceId && deps.machines) {
        try {
          await deps.machines.transition(
            normalized.orgId,
            normalized.machineInstanceId,
            normalized.event,
            normalized.params,
          );
        } catch (cause) {
          const recovered = await recoverPersistedPaidCartProjection(normalized, deps.machines);
          if (!recovered) throw cause;
        }
      }
    }
    if (deps.receipts) await deps.receipts.complete(event);
  } catch (cause) {
    if (deps.receipts) {
      await deps.receipts.fail(
        event,
        cause instanceof Error ? cause.message : "Provider event failed",
      );
    }
    throw cause;
  }
}

/**
 * Recover a post-persistence hook failure without attempting the final machine transition again.
 * This is deliberately limited to a correlated paid cart; generic provider events are not replayed.
 */
export async function recoverPersistedPaidCartProjection(
  normalized: NormalizedProviderEvent,
  machines: Pick<MachineEngine, "getInstance" | "replayPersistedTransition">,
): Promise<boolean> {
  if (
    normalized.event !== "PAYMENT_SUCCEEDED" ||
    !normalized.machineInstanceId ||
    !machines.replayPersistedTransition
  ) {
    return false;
  }

  const paymentRef = readString(normalized.params.paymentRef);
  if (!paymentRef) return false;

  const instance = await machines.getInstance(normalized.orgId, normalized.machineInstanceId);
  if (
    instance?.machineName !== "cart" ||
    instance.currentState !== "paid" ||
    instance.context.paymentRef !== paymentRef
  ) {
    return false;
  }

  return machines.replayPersistedTransition(
    normalized.orgId,
    instance.id,
    normalized.event,
    { paymentRef },
    "paid",
    "awaiting_payment",
  );
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
