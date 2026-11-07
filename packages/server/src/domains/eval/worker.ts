import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { registerBullmqWorker } from "../../shared/bullmq-workers";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import type { EvidenceService } from "../evidence/ports";
import { type EvalJobData, executeEvalJob } from "./job";

/**
 * Eval worker — drains `{eval-runs}` in its own process slice.
 *
 * The long `lockDuration` is deliberate: a tier‑2 sweep renders many routes and can outlive a default lock.
 * Concurrency stays low by default because each job may hold a browser context.
 */
export function startEvalWorker(evidence: EvidenceService): Worker<EvalJobData> | null {
  if (!workersEnabled()) return null;

  const worker = new Worker<EvalJobData>(
    BULLMQ_QUEUES.EVAL,
    async (job) => {
      console.log(
        `[eval-worker] job ${job.id} mode=${job.data.mode ?? "gate"} release=${job.data.releaseId ?? "-"}`,
      );
      return executeEvalJob(job.data, { evidence });
    },
    {
      connection: getRedisConnection(),
      concurrency: workerConcurrency("EVAL_WORKER_CONCURRENCY", 1),
      lockDuration: 120_000,
    },
  );

  registerBullmqWorker(worker);
  return worker;
}
