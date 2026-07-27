import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { orgMiddleware } from "../../shared/org";
import { createAnalyticsRoutes } from "./api";
import { parseErrorIngest, parseTrackIngest } from "./browser-ingest";
import type { ReplayBlobStorage } from "./replay-storage";
import type { AnalyticsService } from "./ports";

function testApp(service: AnalyticsService, replayStorage: ReplayBlobStorage | null = null) {
  const app = new Hono();
  app.use("*", orgMiddleware);
  app.route("/api/analytics", createAnalyticsRoutes(service, replayStorage));
  return app;
}

describe("parseTrackIngest", () => {
  it("accepts batch array", () => {
    const events = [{ eventType: "page_view", sessionId: "s1" }];
    expect(parseTrackIngest(events)).toEqual({ events });
  });

  it("accepts beacon wrapper with orgId", () => {
    const body = {
      orgId: "org-1",
      events: [{ eventType: "page_view", sessionId: "s1" }],
    };
    expect(parseTrackIngest(body)).toEqual(body);
  });
});

describe("parseErrorIngest", () => {
  it("accepts single report wrapper", () => {
    const report = { sessionId: "s1", message: "boom" };
    expect(parseErrorIngest({ orgId: "org-1", report })).toEqual({
      orgId: "org-1",
      reports: [report],
    });
  });
});

describe("analytics browser ingest routes", () => {
  it("POST /track accepts batch with x-org-id", async () => {
    const track = vi.fn(async () => ({ eventId: "e1", accepted: true }));
    const trackBatch = vi.fn(async () => [{ eventId: "e1", accepted: true }]);
    const app = testApp({ track, trackBatch } as unknown as AnalyticsService);

    const res = await app.request("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-org-id": "org-1" },
      body: JSON.stringify([
        { eventType: "page_view", sessionId: "s1", meta: { url: "/" } },
      ]),
    });

    expect(res.status).toBe(201);
    expect(track).toHaveBeenCalledWith("org-1", {
      eventType: "page_view",
      sessionId: "s1",
      meta: { url: "/" },
    });
  });

  it("POST /error stores frontend.error events", async () => {
    const track = vi.fn(async () => ({ eventId: "e1", accepted: true }));
    const app = testApp({ track } as unknown as AnalyticsService);

    const res = await app.request("/api/analytics/error", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-org-id": "org-1" },
      body: JSON.stringify({
        orgId: "org-1",
        report: { sessionId: "s1", message: "test error" },
      }),
    });

    expect(res.status).toBe(201);
    expect(track).toHaveBeenCalledWith("org-1", {
      eventType: "frontend.error",
      sessionId: "s1",
      meta: { sessionId: "s1", message: "test error" },
    });
  });

  it("POST /replay stores chunk summary", async () => {
    const track = vi.fn(async () => ({ eventId: "e1", accepted: true }));
    const app = testApp({ track } as unknown as AnalyticsService);

    const res = await app.request("/api/analytics/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId: "org-1",
        sessionId: "s1",
        events: [{ type: 1 }, { type: 2 }],
      }),
    });

    expect(res.status).toBe(201);
    expect(track).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        eventType: "session_replay.chunk",
        sessionId: "s1",
        meta: expect.objectContaining({ eventCount: 2, storageKey: null }),
      }),
    );
  });

  it("POST /replay uploads blob when R2 storage is configured", async () => {
    const track = vi.fn(async () => ({ eventId: "e1", accepted: true }));
    const putChunk = vi.fn(async () => "replays/org-1/s1/chunk.json");
    const app = testApp({ track } as unknown as AnalyticsService, { putChunk });

    const res = await app.request("/api/analytics/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orgId: "org-1",
        sessionId: "s1",
        events: [{ type: 1 }],
      }),
    });

    expect(res.status).toBe(201);
    expect(putChunk).toHaveBeenCalled();
    expect(track).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        meta: expect.objectContaining({ storageKey: "replays/org-1/s1/chunk.json" }),
      }),
    );
  });
});
