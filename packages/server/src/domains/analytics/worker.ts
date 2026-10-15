import { SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { registerBullmqWorker } from "../../shared/bullmq-workers";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import type { AnalyticsStorage } from "./ports";
import type { AnalyticsJobData } from "./queue";

const tracer = trace.getTracer("analytics-worker");

/**
 * Ingest one job's events. Exported so the "one ClickHouse insert per batch, not per event"
 * property can be asserted directly, without standing up Redis and a real BullMQ worker.
 *
 * There is exactly one job format Ã¢â‚¬â€ `{ events: [...] }` Ã¢â‚¬â€ set by the producers in `service.ts`.
 * A pre-batching job carrying a bare single event was tolerated here for one commit; that
 * tolerance is gone, because nothing is deployed yet and supporting two payload shapes means two
 * contracts, two code paths, and two ways for a producer and worker to disagree in silence. If a
 * stray old-shape job did reach this worker it now throws and fails visibly instead of being
 * silently accepted as a different shape than the producers write.
 */
export async function processAnalyticsJob(
  storage: AnalyticsStorage,
  data: AnalyticsJobData | undefined,
): Promise<void> {
  const events = data?.events ?? [];
  if (events.length === 0) return;

  await tracer.startActiveSpan("analytics.ingest.batch", async (span) => {
    try {
      // One insert for the whole batch. `ingestBatch` issues a single multi-row INSERT, so
      // this is one statement per job rather than one per event.
      span.setAttribute("analytics.batch_size", events.length);
      await storage.ingestBatch(events);
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}

export function startAnalyticsWorker(storage: AnalyticsStorage): Worker<AnalyticsJobData> | null {
  if (!workersEnabled()) return null;

  const worker = new Worker<AnalyticsJobData>(
    BULLMQ_QUEUES.ANALYTICS,
    async (job) => {
      // Ingest inside the job and await it.
      //
      // The previous design buffered events in process memory and returned before the
      // write completed, so BullMQ marked the job complete while the data was still
      // only in RAM Ã¢â‚¬â€ and the failure path only recorded a span. A crash (or a
      // ClickHouse error) silently dropped the buffered events: at-most-once.
      //
      // Awaiting keeps the job open until the write lands, and letting the error
      // propagate lets the queue's retry/backoff actually run.
      await processAnalyticsJob(storage, job.data);
    },
    {
      connection: getRedisConnection(),
      concurrency: workerConcurrency("ANALYTICS_WORKER_CONCURRENCY", 1),
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 100 },
    },
  );

  registerBullmqWorker(worker);

  return worker;
}
