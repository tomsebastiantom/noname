import { getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import type { ProviderForwardedEvent } from "./provider-events";

export interface ProviderEventJob {
  event: ProviderForwardedEvent;
}

export function getProviderEventQueue() {
  return getBullmqQueue<ProviderEventJob>(BULLMQ_QUEUES.PROVIDER_EVENTS, {
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 500 },
    },
  });
}
