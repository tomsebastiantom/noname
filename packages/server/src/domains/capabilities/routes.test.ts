import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { CapabilityIdempotencyStore, IdempotencyClaim } from "./idempotency";
import { createCapabilityRegistry } from "./registry";
import { registerCapabilityRoutes } from "./routes";

function createFakeIdempotency(): CapabilityIdempotencyStore {
  const records = new Map<string, { hash: string; result?: unknown }>();
  return {
    async claim(orgId, capability, key, hash): Promise<IdempotencyClaim> {
      const id = `${orgId}:${capability}:${key}`;
      const existing = records.get(id);
      if (!existing) {
        records.set(id, { hash });
        return { kind: "claimed" };
      }
      if (existing.hash !== hash) return { kind: "conflict" };
      if (existing.result !== undefined) return { kind: "replay", result: existing.result };
      return { kind: "in_progress" };
    },
    async complete(orgId, capability, key, result) {
      const id = `${orgId}:${capability}:${key}`;
      const existing = records.get(id);
      if (existing) existing.result = result;
    },
    async fail(orgId, capability, key) {
      records.delete(`${orgId}:${capability}:${key}`);
    },
  };
}

function createTestApp(handler: (input: unknown) => Promise<unknown>) {
  const app = new Hono();
  app.onError((_error, c) => c.json({ error: "failed" }, 500));
  app.use("*", async (c, next) => {
    c.set("orgId", "org-1");
    await next();
  });
  registerCapabilityRoutes(
    app,
    createCapabilityRegistry({ "commerce.checkout": async (input) => handler(input) }),
    { get: async () => ({ publishableKey: "public-key" }) } as never,
    createFakeIdempotency(),
  );
  return app;
}

describe("capability idempotency", () => {
  it("replays an identical completed request without executing twice", async () => {
    let calls = 0;
    const app = createTestApp(async (input) => ({ input, call: ++calls }));
    const request = () =>
      app.request("/commerce.checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-org-id": "org-1",
          "x-publishable-key": "public-key",
          "Idempotency-Key": "attempt-1",
        },
        body: JSON.stringify({ input: { value: 1 } }),
      });

    const first = await request();
    const second = await request();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toEqual(await second.json());
    expect(calls).toBe(1);
  });

  it("releases a failed attempt so a safe retry can run", async () => {
    let calls = 0;
    const app = createTestApp(async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary failure");
      return { ok: true };
    });
    const request = () =>
      app.request("/commerce.checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-org-id": "org-1",
          "x-publishable-key": "public-key",
          "Idempotency-Key": "attempt-retry",
        },
        body: JSON.stringify({ input: { value: 1 } }),
      });

    expect((await request()).status).toBe(500);
    expect((await request()).status).toBe(200);
    expect(calls).toBe(2);
  });

  it("rejects reusing a key with a different request", async () => {
    const app = createTestApp(async (input) => input);
    const headers = {
      "content-type": "application/json",
      "x-org-id": "org-1",
      "x-publishable-key": "public-key",
      "Idempotency-Key": "attempt-2",
    };
    const first = await app.request("/commerce.checkout", {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { value: 1 } }),
    });
    const second = await app.request("/commerce.checkout", {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { value: 2 } }),
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
  });
});
