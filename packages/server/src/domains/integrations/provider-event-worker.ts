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
  PROVIDER_EVENT_NORMALIZED,
  type ProviderEventMapping,
  type ProviderForwardedEvent,
} from "./provider-events";

export function startProviderEventWorker(deps: {
  machines?: Pick<MachineEngine, "transition">;
  mappings?: ProviderEventMapping[];
  receipts?: ProviderEventReceiptStore;
}): Worker<ProviderEventJob> | null {
  if (!workersEnabled()) return null;
  const registry = createProviderEventRegistry([
    createMachineEventMapping(),
    ...(deps.mappings ?? []),
  ]);
  return new Worker<ProviderEventJob>(
    BULLMQ_QUEUES.PROVIDER_EVENTS,
    async (job) => {
      const event: ProviderForwardedEvent = job.data.event;
      try {
        await eventBus.publish("provider.event.received", event);
        const normalized = registry.normalize(event);
        if (normalized) {
          await eventBus.publish(PROVIDER_EVENT_NORMALIZED, normalized);
          if (normalized.machineInstanceId && deps.machines) {
            await deps.machines.transition(
              normalized.orgId,
              normalized.machineInstanceId,
              normalized.event,
              normalized.params,
            );
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
    },
    {
      connection: getRedisConnection(),
      concurrency: workerConcurrency("PROVIDER_EVENT_WORKER_CONCURRENCY", 8),
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
}
