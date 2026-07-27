import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { orgMiddleware } from "./org";

describe("orgMiddleware", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function testApp() {
    const app = new Hono();
    app.use("*", orgMiddleware);
    app.get("/api/test", (c) => c.json({ ok: true }));
    return app;
  }

  it("allows requests without HMAC in dev", async () => {
    vi.stubEnv("REQUIRE_EDGE_HMAC", "false");
    vi.stubEnv("WORKER_SERVER_SECRET", "test-secret");
    const res = await testApp().request("/api/test", {
      headers: { "x-org-id": "org-1" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects requests without HMAC when REQUIRE_EDGE_HMAC=true", async () => {
    vi.stubEnv("REQUIRE_EDGE_HMAC", "true");
    vi.stubEnv("WORKER_SERVER_SECRET", "test-secret");
    const res = await testApp().request("/api/test", {
      headers: { "x-org-id": "org-1" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("edge worker");
  });
});
