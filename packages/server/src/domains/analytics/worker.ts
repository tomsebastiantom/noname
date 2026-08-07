import { SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import type { AnalyticsStorage } from "./ports";
import type { AnalyticsJobData } from "./queue";

const tracer = trace.getTracer("analytics-worker");

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 2000;

export function startAnalyticsWorker(storage: AnalyticsStorage): Worker<AnalyticsJobData> | null {
  if (!workersEnabled()) return null;

  let batch: AnalyticsJobData[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  async function flush() {
    if (batch.length === 0) return;
    const current = batch;
    batch = [];
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await tracer.startActiveSpan("analytics.ingest.batch", async (span) => {
      try {
        span.setAttribute("analytics.batch_size", current.length);
        await storage.ingestBatch(current);
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
      } finally {
        span.end();
      }
    });
  }

  const worker = new Worker<AnalyticsJobData>(
    BULLMQ_QUEUES.ANALYTICS,
    async (job) => {
      batch.push(job.data);

      if (batch.length >= BATCH_SIZE) {
        await flush();
      } else if (!flushTimer) {
        flushTimer = setTimeout(flush, FLUSH_INTERVAL_MS);
      }
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
