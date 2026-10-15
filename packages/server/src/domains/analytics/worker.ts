import { SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import type { AnalyticsEventDTO, AnalyticsStorage } from "./ports";
import type { AnalyticsJobData } from "./queue";

const tracer = trace.getTracer("analytics-worker");

function isBatchedJobData(data: AnalyticsJobData | AnalyticsEventDTO): data is AnalyticsJobData {
  return Array.isArray((data as { events?: unknown }).events);
}

/**
 * Jobs enqueued before batching landed carry a single event as the job data, rather than
 * `{ events: [...] }`. A deploy can leave such a job in Redis, and a worker that only understood
 * the new shape would throw on it and burn its retries. Read both shapes so the rollout is not a
 * source of dropped events.
 */
export function eventsFromJobData(
  data: AnalyticsJobData | AnalyticsEventDTO | undefined,
): AnalyticsEventDTO[] {
  if (!data) return [];
  if (isBatchedJobData(data)) return data.events;
  return [data];
}

/**
 * Ingest one job's events. Exported so the "one ClickHouse insert per batch, not per event"
 * property can be asserted directly, without standing up Redis and a real BullMQ worker.
 */
export async function processAnalyticsJob(
  storage: AnalyticsStorage,
  data: AnalyticsJobData | AnalyticsEventDTO | undefined,
): Promise<void> {
  const events = eventsFromJobData(data);
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
      // only in RAM — and the failure path only recorded a span. A crash (or a
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

  return worker;
}
