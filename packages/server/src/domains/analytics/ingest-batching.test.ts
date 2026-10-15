import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnalyticsEventDTO, AnalyticsStorage } from "./ports";
import { analyticsIngestBatchSize, chunkAnalyticsEvents } from "./queue";
import { createAnalyticsService } from "./service";
import { eventsFromJobData, processAnalyticsJob } from "./worker";

/**
 * Regression guard for the write amplification introduced when analytics ingest was made durable.
 *
 * That fix was right — it awaited the write inside the job so BullMQ could not mark a job complete
 * while the data still sat in RAM, and it raised `attempts` so ClickHouse errors retried. But it
 * also collapsed every job to exactly one event, so a browser batch of N events became N Redis jobs
 * and N ClickHouse `INSERT`s. These tests pin the restored shape: one job carries many events, and
 * one job performs exactly one insert.
 */

const UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function event(index: number): AnalyticsEventDTO {
  const padded = `${index}`.padStart(8, "0");
  return {
    eventId: `${padded}-0000-4000-8000-000000000000`,
    orgId: "org-1",
    eventType: "page_view",
    eventSource: "frontend",
    timestamp: new Date(),
    sessionId: UUID,
    schemaId: null,
    variantId: null,
    audienceKey: null,
    audienceDefinitionVersion: null,
    bindingId: null,
    bindingVersion: null,
    decisionId: null,
    pageKey: null,
    locale: null,
    meta: {},
  };
}

function createQueue() {
  return {
    add: vi.fn(async () => {}),
    addBulk: vi.fn(async () => {}),
  };
}

afterEach(() => {
  delete process.env.ANALYTICS_INGEST_BATCH_SIZE;
});

describe("analytics ingest batching", () => {
  it("splits events into job-sized chunks and drops the empty remainder", () => {
    expect(chunkAnalyticsEvents([], 500)).toEqual([]);
    expect(chunkAnalyticsEvents([1, 2, 3].map(event), 3)).toHaveLength(1);
    expect(chunkAnalyticsEvents([1, 2, 3, 4].map(event), 3).map((c) => c.length)).toEqual([3, 1]);
    expect(chunkAnalyticsEvents([1, 2, 3, 4, 5].map(event), 2).map((c) => c.length)).toEqual([
      2, 2, 1,
    ]);
  });

  it("never loops forever on a non-positive chunk size", () => {
    // A misconfigured size must not become an infinite loop.
    expect(chunkAnalyticsEvents([1, 2].map(event), 0).map((c) => c.length)).toEqual([2]);
    expect(chunkAnalyticsEvents([1, 2].map(event), -5).map((c) => c.length)).toEqual([2]);
  });

  it("reads the batch size from the environment and rejects nonsense values", () => {
    expect(analyticsIngestBatchSize()).toBe(500);
    process.env.ANALYTICS_INGEST_BATCH_SIZE = "250";
    expect(analyticsIngestBatchSize()).toBe(250);
    process.env.ANALYTICS_INGEST_BATCH_SIZE = "not-a-number";
    expect(analyticsIngestBatchSize()).toBe(500);
    process.env.ANALYTICS_INGEST_BATCH_SIZE = "0";
    expect(analyticsIngestBatchSize()).toBe(500);
  });

  it("enqueues one job per chunk rather than one job per event", async () => {
    const queue = createQueue();
    const service = createAnalyticsService({} as unknown as AnalyticsStorage, queue as never);

    // 1_200 events at the 500 default => 3 jobs, not 1_200.
    const result = await service.trackBatch(
      "org-1",
      Array.from({ length: 1_200 }, (_, index) => ({
        eventType: "page_view",
        sessionId: UUID,
        meta: { index },
      })),
    );

    expect(result).toHaveLength(1_200);
    expect(queue.add).not.toHaveBeenCalled();
    expect(queue.addBulk).toHaveBeenCalledTimes(1);

    const jobs = queue.addBulk.mock.calls[0]?.[0] as unknown as { data: { events: unknown[] } }[];
    expect(jobs).toHaveLength(3);
    expect(jobs.map((job) => job.data.events.length)).toEqual([500, 500, 200]);
    // Every event must survive chunking exactly once.
    const total = jobs.reduce((sum, job) => sum + job.data.events.length, 0);
    expect(total).toBe(1_200);
  });

  it("stops enqueueing when the batch is empty", async () => {
    const queue = createQueue();
    const service = createAnalyticsService({} as unknown as AnalyticsStorage, queue as never);

    await service.trackBatch("org-1", []);

    expect(queue.addBulk).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("performs exactly one insert for a batch job", async () => {
    const storage = { ingestBatch: vi.fn(async () => {}) } as unknown as AnalyticsStorage;

    await processAnalyticsJob(storage, { events: [event(1), event(2), event(3)] });

    // The whole point: three events, one call. Previously this was three jobs and three calls.
    expect(storage.ingestBatch).toHaveBeenCalledTimes(1);
    expect(
      (storage.ingestBatch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0],
    ).toHaveLength(3);
  });

  it("still processes a pre-batching single-event job left in the queue", async () => {
    const storage = { ingestBatch: vi.fn(async () => {}) } as unknown as AnalyticsStorage;

    // Legacy job shape: the event itself is the job data.
    await processAnalyticsJob(storage, event(7));

    expect(storage.ingestBatch).toHaveBeenCalledTimes(1);
    expect(
      (storage.ingestBatch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0],
    ).toHaveLength(1);
  });

  it("does not touch storage for an empty or malformed job payload", async () => {
    const storage = { ingestBatch: vi.fn(async () => {}) } as unknown as AnalyticsStorage;

    await processAnalyticsJob(storage, { events: [] });
    await processAnalyticsJob(storage, undefined);

    expect(storage.ingestBatch).not.toHaveBeenCalled();
  });

  it("normalizes both job shapes", () => {
    const single = event(1);
    expect(eventsFromJobData({ events: [single] })).toHaveLength(1);
    expect(eventsFromJobData(single)).toEqual([single]);
    expect(eventsFromJobData(undefined)).toEqual([]);
  });
});
