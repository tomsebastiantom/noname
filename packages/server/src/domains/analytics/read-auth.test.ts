import { PERMISSIONS, zitadelProjectRolesClaimKey } from "@noname/auth";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { orgMiddleware } from "../../shared/org";
import { createAnalyticsRoutes } from "./api";
import type { AnalyticsEventDTO, AnalyticsService } from "./ports";
import { assertReplayStorageKey } from "./read-guards";
import type { ReplayBlobStorage } from "./replay-storage";

vi.mock("../auth/adapters/zitadel/project-id", () => ({
  zitadelProjectIdOrNull: vi.fn(() => "proj-123"),
}));

function jwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `header.${body}.sig`;
}

const adminToken = jwt({
  sub: "user-admin",
  [zitadelProjectRolesClaimKey("proj-123")]: { admin: {} },
});

const editorToken = jwt({
  sub: "user-editor",
  [zitadelProjectRolesClaimKey("proj-123")]: { editor: {} },
});

function testApp(service: AnalyticsService, replayStorage: ReplayBlobStorage | null = null) {
  const app = new Hono();
  app.use("*", orgMiddleware);
  app.route("/api/analytics", createAnalyticsRoutes(service, replayStorage));
  return app;
}

describe("assertReplayStorageKey", () => {
  it("accepts org-prefixed json keys", () => {
    expect(assertReplayStorageKey("org-1", "replays/org-1/s1/chunk.json")).toBe(true);
  });

  it("rejects cross-org and traversal", () => {
    expect(assertReplayStorageKey("org-1", "replays/org-2/s1/chunk.json")).toBe(false);
    expect(assertReplayStorageKey("org-1", "replays/org-1/../secret.json")).toBe(false);
  });
});

describe("analytics read auth", () => {
  beforeEach(() => {
    vi.stubEnv("ZITADEL_PROJECT_ID", "proj-123");
  });

  const sampleEvent: AnalyticsEventDTO = {
    eventId: "e1",
    orgId: "org-1",
    eventType: "session_replay.chunk",
    eventSource: "frontend",
    timestamp: new Date("2026-01-01T12:00:00Z"),
    sessionId: "sess-1",
    schemaId: null,
    variantId: null,
    contextHash: null,
    meta: { storageKey: "replays/org-1/sess-1/chunk.json" },
  };

  it("GET /events returns 401 without bearer token", async () => {
    const app = testApp({ query: vi.fn(async () => []) } as unknown as AnalyticsService);
    const res = await app.request("/api/analytics/events", {
      headers: { "x-org-id": "org-1" },
    });
    expect(res.status).toBe(401);
  });

  it("GET /events returns 403 for editor", async () => {
    const app = testApp({ query: vi.fn(async () => []) } as unknown as AnalyticsService);
    const res = await app.request("/api/analytics/events", {
      headers: {
        Authorization: `Bearer ${editorToken}`,
        "x-org-id": "org-1",
      },
    });
    expect(res.status).toBe(403);
  });

  it("GET /events uses trusted org id for admin", async () => {
    const query = vi.fn(async () => []);
    const app = testApp({ query } as unknown as AnalyticsService);
    const res = await app.request("/api/analytics/events?orgId=other-org&limit=5", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "x-org-id": "org-1",
      },
    });
    expect(res.status).toBe(200);
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-1", limit: 5 }));
  });

  it("GET /replay/sessions groups chunk events for admin", async () => {
    const query = vi.fn(async () => [sampleEvent]);
    const app = testApp({ query } as unknown as AnalyticsService);
    const res = await app.request("/api/analytics/replay/sessions", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "x-org-id": "org-1",
      },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { sessions: Array<{ sessionId: string; chunkCount: number }> };
    };
    expect(body.data.sessions).toHaveLength(1);
    expect(body.data.sessions[0]?.sessionId).toBe("sess-1");
    expect(body.data.sessions[0]?.chunkCount).toBe(1);
  });

  it("GET /replay/chunks rejects cross-org storage key", async () => {
    const getChunk = vi.fn(async () => "[]");
    const replayStorage: ReplayBlobStorage = {
      putChunk: vi.fn(async () => "replays/org-1/s1/c.json"),
      getChunk,
    };
    const app = testApp(
      { query: vi.fn(async () => []) } as unknown as AnalyticsService,
      replayStorage,
    );
    const res = await app.request("/api/analytics/replay/chunks/replays/other-org/s1/c.json", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "x-org-id": "org-1",
      },
    });
    expect(res.status).toBe(403);
    expect(getChunk).not.toHaveBeenCalled();
  });

  it("GET /replay/chunks streams chunk for admin", async () => {
    const getChunk = vi.fn(async () => '[{"type":2}]');
    const replayStorage: ReplayBlobStorage = {
      putChunk: vi.fn(async () => "replays/org-1/s1/c.json"),
      getChunk,
    };
    const app = testApp(
      { query: vi.fn(async () => []) } as unknown as AnalyticsService,
      replayStorage,
    );
    const res = await app.request("/api/analytics/replay/chunks/replays/org-1/s1/c.json", {
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "x-org-id": "org-1",
      },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('[{"type":2}]');
    expect(getChunk).toHaveBeenCalledWith("replays/org-1/s1/c.json");
  });

  it("admin role includes analytics:view permission", () => {
    expect(PERMISSIONS.ANALYTICS_VIEW).toBe("analytics:view");
  });
});
