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
    app.post("/api/integrations/nango/incoming", (c) => c.json({ ok: true }));
    app.post("/api/integrations/nango/webhook", (c) => c.json({ ok: true }));
    return app;
  }

  it("allows requests without HMAC when no secret is configured", async () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "");
    const res = await testApp().request("/api/test", {
      headers: { "x-org-id": "org-1" },
    });
    expect(res.status).toBe(200);
  });

  it("rejects requests without HMAC when a secret is configured", async () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-secret");
    const res = await testApp().request("/api/test", {
      headers: { "x-org-id": "org-1" },
    });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toContain("edge worker");
  });

  it("lets Nango webhook endpoints verify their own signatures", async () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-secret");
    const app = testApp();
    const incoming = await app.request("/api/integrations/nango/incoming", { method: "POST" });
    const lifecycle = await app.request("/api/integrations/nango/webhook", { method: "POST" });
    const unrelated = await app.request("/api/integrations/nango/incoming", { method: "GET" });

    expect(incoming.status).toBe(200);
    expect(lifecycle.status).toBe(200);
    expect(unrelated.status).toBe(401);
  });
});
