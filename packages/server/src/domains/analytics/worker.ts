import { Worker } from "bullmq";
import { getRedisConnection } from "../../shared/redis";
import type { AnalyticsStorage } from "./ports";
import type { AnalyticsJobData } from "./queue";

const BATCH_SIZE = 50;
const FLUSH_INTERVAL_MS = 2000;

export function startAnalyticsWorker(storage: AnalyticsStorage): Worker<AnalyticsJobData> {
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
    try {
      await storage.ingestBatch(current);
    } catch {
      // Analytics events are disposable — silently drop on failure
    }
  }

  const worker = new Worker<AnalyticsJobData>(
    "analytics-events",
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
      concurrency: 1,
      removeOnComplete: { count: 0 },
      removeOnFail: { count: 100 },
    },
  );

  return worker;
}
