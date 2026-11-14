import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../../shared/bullmq-queues";
import { registerBullmqWorker } from "../../../shared/bullmq-workers";
import { closeBullmqQueue, getBullmqQueue } from "../../../shared/bullmq-queue";
import { getRedisConnection } from "../../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../../shared/worker-runtime";
import type { ProvisioningService } from "./ports";

export type ProvisioningJobData = { orgId: string };

/**
 * Provisioning runs on the queue, not in the request.
 *
 * Two problems this fixes: a run used to die with the process (the tenant stayed `in_progress` with nobody to notice),
 * and a failed IdP step was never retried. Retries are safe because every step is idempotent — the org is looked up by
 * name, the grant and account are reused, and the directory upsert converges.
 *
 * `jobId` is the tenant, so two requests for the same tenant cannot run two provisionings at once.
 */
export function getProvisioningQueue() {
  return getBullmqQueue<ProvisioningJobData>(BULLMQ_QUEUES.PROVISIONING);
}

export async function enqueueProvisioning(orgId: string): Promise<void> {
  await getProvisioningQueue().add("provision", { orgId }, {
    // BullMQ 5 refuses ":" in a custom job id � it is reserved for its own key layout.
    jobId: `provisioning-${orgId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 2_000 },
    removeOnComplete: 100,
    removeOnFail: 200,
  });
}

export function startProvisioningWorker(service: ProvisioningService): Worker | null {
  if (!workersEnabled()) return null;

  const worker = new Worker<ProvisioningJobData>(
    BULLMQ_QUEUES.PROVISIONING,
    async (job) => {
      await service.run(job.data.orgId);
    },
    { connection: getRedisConnection(), concurrency: workerConcurrency("PROVISIONING_CONCURRENCY", 2) },
  );

  registerBullmqWorker(worker);
  return worker;
}

export async function closeProvisioningQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.PROVISIONING);
}
