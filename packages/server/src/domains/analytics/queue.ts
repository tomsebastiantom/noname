import { closeBullmqQueue, getBullmqQueue } from "../../shared/bullmq-queue";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import type { AnalyticsEventDTO } from "./ports";

/**
 * One job carries a *batch* of events, not a single event.
 *
 * A previous fix made ingest durable — awaited inside the job, errors propagated, `attempts`
 * raised — but it also reduced every job to exactly one event, so a 100-event browser batch became
 * 100 Redis jobs and 100 separate ClickHouse `INSERT`s. That is the write amplification this shape
 * exists to remove.
 *
 * Batching happens at *enqueue* time rather than in an in-process buffer. A buffer is precisely
 * what caused the original at-most-once bug: jobs were marked complete while the events still sat
 * in RAM, so a crash dropped them. Here the queue itself is the buffer, so there is nothing to lose
 * on a crash — and because {@link AnalyticsJobData.events} is inserted as one statement, a batch
 * either lands or does not.
 */
export type AnalyticsJobData = { events: AnalyticsEventDTO[] };

const DEFAULT_INGEST_BATCH_SIZE = 500;

/**
 * Upper bound on events per job. This bounds two separate things:
 *
 * - the Redis job payload, and
 * - how much a single retry can duplicate. `analytics_events` is a plain `MergeTree()` ordered by
 *   `(org_id, event_type, timestamp)` with no dedup on `event_id`, so if ClickHouse commits and the
 *   acknowledgement is lost, the retry re-inserts the batch. Bounding the batch bounds that.
 *
 * It also stops an oversized client batch from becoming one enormous `INSERT`, since the track
 * endpoint does not cap how many events a client may send.
 */
export function analyticsIngestBatchSize(): number {
  const raw = process.env.ANALYTICS_INGEST_BATCH_SIZE;
  if (!raw) return DEFAULT_INGEST_BATCH_SIZE;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_INGEST_BATCH_SIZE;
}

/**
 * Split events into job-sized chunks. Returns `[]` for an empty input so callers can skip enqueueing
 * entirely, and never returns an empty chunk.
 */
export function chunkAnalyticsEvents(
  events: AnalyticsEventDTO[],
  size: number,
): AnalyticsEventDTO[][] {
  if (events.length === 0) return [];
  const width = Number.isFinite(size) && size >= 1 ? Math.floor(size) : DEFAULT_INGEST_BATCH_SIZE;
  const chunks: AnalyticsEventDTO[][] = [];
  for (let index = 0; index < events.length; index += width) {
    chunks.push(events.slice(index, index + width));
  }
  return chunks;
}

export function getAnalyticsQueue() {
  return getBullmqQueue<AnalyticsJobData>(BULLMQ_QUEUES.ANALYTICS, {
    defaultJobOptions: {
      // A single attempt made ingest at-most-once: any ClickHouse error dropped the
      // event silently. Retry with backoff before giving up.
      attempts: 5,
      backoff: { type: "exponential", delay: 1_000 },
    },
  });
}

export async function closeAnalyticsQueue(): Promise<void> {
  await closeBullmqQueue(BULLMQ_QUEUES.ANALYTICS);
}
