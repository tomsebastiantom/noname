import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import { eventBus } from "../../shared/event-bus";
import type { MachineEngine } from "../machines/ports";
import {
  createMachineEventMapping,
  createProviderEventRegistry,
  PROVIDER_EVENT_NORMALIZED,
  type ProviderEventMapping,
  type ProviderForwardedEvent,
} from "./provider-events";
import type { ProviderEventJob } from "./provider-event-queue";

export function startProviderEventWorker(deps: {
  machines?: Pick<MachineEngine, "transition">;
  mappings?: ProviderEventMapping[];
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
      await eventBus.publish("provider.event.received", event);
      const normalized = registry.normalize(event);
      if (!normalized) return;
      await eventBus.publish(PROVIDER_EVENT_NORMALIZED, normalized);
      if (!normalized.machineInstanceId) return;
      if (!deps.machines) return;
      await deps.machines.transition(
        normalized.orgId,
        normalized.machineInstanceId,
        normalized.event,
        normalized.params,
      );
    },
    {
      connection: getRedisConnection(),
      concurrency: workerConcurrency("PROVIDER_EVENT_WORKER_CONCURRENCY", 8),
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  );
}
