import { SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import type { AnalyticsStorage } from "./ports";
import type { AnalyticsJobData } from "./queue";

const tracer = trace.getTracer("analytics-worker");

export function startAnalyticsWorker(storage: AnalyticsStorage): Worker<AnalyticsJobData> | null {
  if (!workersEnabled()) return null;

  const worker = new Worker<AnalyticsJobData>(
    BULLMQ_QUEUES.ANALYTICS,
    async (job) => {
      // Ingest inside the job and await it.
      //
      // The previous design buffered events in process memory and returned before the
      // write completed, so BullMQ marked the job complete while the data was still
      // only in RAM — and the failure path only recorded a span. A crash (or a
      // ClickHouse error) silently dropped the buffered events: at-most-once.
      //
      // Awaiting keeps the job open until the write lands, and letting the error
      // propagate lets the queue's retry/backoff actually run.
      await tracer.startActiveSpan("analytics.ingest.batch", async (span) => {
        try {
          span.setAttribute("analytics.batch_size", 1);
          await storage.ingestBatch([job.data]);
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
          throw error;
        } finally {
          span.end();
        }
      });
    },
    {
      connection: getRedisConnection(),
      concurrency: workerConcurrency("ANALYTICS_WORKER_CONCURRENCY", 1),
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 100 },
    },
  );

  return worker;
}
