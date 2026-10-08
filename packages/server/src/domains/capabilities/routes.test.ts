import { PERMISSIONS, zitadelProjectRolesClaimKey } from "@noname/auth";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import type { CapabilityIdempotencyStore, IdempotencyClaim } from "./idempotency";
import { createCapabilityRegistry } from "./registry";
import { registerCapabilityRoutes } from "./routes";

vi.mock("../auth/adapters/zitadel/project-id", () => ({
  zitadelProjectIdOrNull: () => "proj-123",
}));

function jwt(userId: string, role = "admin"): string {
  const body = Buffer.from(
    JSON.stringify({
      sub: userId,
      [zitadelProjectRolesClaimKey("proj-123")]: { [role]: {} },
    }),
  ).toString("base64url");
  return `header.${body}.sig`;
}

function createFakeIdempotency(): CapabilityIdempotencyStore {
  const records = new Map<string, { hash: string; claimToken: string; result?: unknown }>();
  let attempts = 0;
  return {
    async claim(orgId, capability, key, hash): Promise<IdempotencyClaim> {
      const id = `${orgId}:${capability}:${key}`;
      const existing = records.get(id);
      if (!existing) {
        const claimToken = `attempt-${++attempts}`;
        records.set(id, { hash, claimToken });
        return { kind: "claimed", claimToken };
      }
      if (existing.hash !== hash) return { kind: "conflict" };
      if (existing.result !== undefined) return { kind: "replay", result: existing.result };
      return { kind: "in_progress" };
    },
    async complete(orgId, capability, key, claimToken, result) {
      const id = `${orgId}:${capability}:${key}`;
      const existing = records.get(id);
      if (existing?.claimToken === claimToken) existing.result = result;
    },
    async fail(orgId, capability, key, claimToken) {
      const id = `${orgId}:${capability}:${key}`;
      if (records.get(id)?.claimToken === claimToken) records.delete(id);
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
    createCapabilityRegistry({
      "commerce.checkout": {
        handler: async (input) => handler(input),
        kind: "command",
        permission: PERMISSIONS.STOREFRONT_VIEW,
        extension: "commerce",
        publicAccess: "publishable-key",
      },
    }),
    { get: async () => ({ publishableKey: "public-key" }) } as never,
    createFakeIdempotency(),
    { isExtensionInstalled: async () => true },
  );
  return app;
}

function createPolicyApp(
  registry: ReturnType<typeof createCapabilityRegistry>,
  options: { isExtensionInstalled?: (orgId: string, extension: string) => Promise<boolean> } = {},
  idempotency?: CapabilityIdempotencyStore,
) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("orgId", "org-1");
    c.set("userId", c.req.header("x-test-verified-user") ?? "");
    await next();
  });
  registerCapabilityRoutes(app, registry, undefined, idempotency, options);
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

  it("does not replay a signed-in checkout result across accounts", async () => {
    let calls = 0;
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("orgId", "org-1");
      c.set("userId", c.req.header("x-test-verified-user") ?? "");
      await next();
    });
    registerCapabilityRoutes(
      app,
      createCapabilityRegistry({
        "commerce.checkout": {
          handler: async (_input, context) => ({
            actorId: context.actorId,
            call: ++calls,
          }),
          kind: "command",
          permission: PERMISSIONS.STOREFRONT_VIEW,
          extension: "commerce",
          publicAccess: "publishable-key",
        },
      }),
      { get: async () => ({ publishableKey: "public-key" }) } as never,
      createFakeIdempotency(),
      { isExtensionInstalled: async () => true },
    );
    const request = (userId: string) =>
      app.request("/commerce.checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${jwt(userId)}`,
          "x-test-verified-user": userId,
          "Idempotency-Key": "same-checkout-key",
        },
        body: JSON.stringify({ input: { instanceId: "cart-1" } }),
      });

    const first = await request("account-1");
    const second = await request("account-2");
    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(await first.json()).toMatchObject({ data: { actorId: "account-1" } });
    expect(calls).toBe(1);
  });

  it("uses only server-verified HMAC identity for capability actorId", async () => {
    let actorId: string | undefined;
    const app = new Hono();
    app.use("*", async (c, next) => {
      c.set("orgId", "org-1");
      c.set("userId", c.req.header("x-test-verified-user") ?? "");
      await next();
    });
    registerCapabilityRoutes(
      app,
      createCapabilityRegistry({
        "commerce.checkout": {
          handler: async (_input, context) => {
            actorId = context.actorId;
            return { ok: true };
          },
          kind: "command",
          permission: PERMISSIONS.STOREFRONT_VIEW,
          extension: "commerce",
          publicAccess: "publishable-key",
        },
      }),
      { get: async () => ({ publishableKey: "public-key" }) } as never,
      createFakeIdempotency(),
      { isExtensionInstalled: async () => true },
    );

    const response = await app.request("/commerce.checkout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${jwt("verified-account")}`,
        "x-org-id": "org-1",
        "x-user-id": "spoofed-header-user",
        "x-test-verified-user": "verified-account",
        "Idempotency-Key": "identity-check",
      },
      body: JSON.stringify({ input: { value: 1 } }),
    });

    expect(response.status).toBe(200);
    expect(actorId).toBe("verified-account");
  });

  it("executes repeated queries fresh without requiring or claiming an idempotency key", async () => {
    let calls = 0;
    const idempotency: CapabilityIdempotencyStore = {
      claim: vi.fn(async () => ({ kind: "claimed" as const, claimToken: "query-test-token" })),
      complete: vi.fn(async () => undefined),
      fail: vi.fn(async () => undefined),
    };
    const app = createPolicyApp(
      createCapabilityRegistry({
        "commerce.orders.search": {
          handler: async (input, context) => ({
            call: ++calls,
            input,
            orgId: context.orgId,
            actorId: context.actorId,
          }),
          kind: "query",
          permission: PERMISSIONS.COMMERCE_ORDERS_VIEW,
          extension: "commerce",
        },
      }),
      { isExtensionInstalled: async () => true },
      idempotency,
    );
    const request = () =>
      app.request("/commerce.orders.search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt("analyst-1", "analyst")}`,
          "x-test-verified-user": "analyst-1",
          "content-type": "application/json",
        },
        body: JSON.stringify({ input: { orgId: "attacker-org", actorId: "spoofed" } }),
      });

    const first = await request();
    const second = await request();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await first.json()).toMatchObject({
      data: { call: 1, orgId: "org-1", actorId: "analyst-1", input: { orgId: "attacker-org" } },
    });
    expect(await second.json()).toMatchObject({ data: { call: 2 } });
    expect(idempotency.claim).not.toHaveBeenCalled();
  });

  it("enforces manage permission and installation before executing a command", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const app = createPolicyApp(
      createCapabilityRegistry({
        "commerce.orders.cancel": {
          handler,
          kind: "command",
          permission: PERMISSIONS.COMMERCE_ORDERS_MANAGE,
          extension: "commerce",
        },
      }),
      { isExtensionInstalled: async () => true },
      createFakeIdempotency(),
    );
    const denied = await app.request("/commerce.orders.cancel", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt("analyst-1", "analyst")}`,
        "x-test-verified-user": "analyst-1",
        "content-type": "application/json",
        "Idempotency-Key": "denied-command",
      },
      body: JSON.stringify({ input: { orderId: "order-1" } }),
    });
    expect(denied.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();

    const unavailable = createPolicyApp(
      createCapabilityRegistry({
        "commerce.orders.cancel": {
          handler,
          kind: "command",
          permission: PERMISSIONS.COMMERCE_ORDERS_MANAGE,
          extension: "commerce",
        },
      }),
      { isExtensionInstalled: async () => false },
      createFakeIdempotency(),
    );
    const notInstalled = await unavailable.request("/commerce.orders.cancel", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt("admin-1")}`,
        "x-test-verified-user": "admin-1",
        "content-type": "application/json",
        "Idempotency-Key": "uninstalled-command",
      },
      body: JSON.stringify({ input: { orderId: "order-1" } }),
    });
    expect(notInstalled.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it("fails closed if a command has no idempotency store", async () => {
    const handler = vi.fn(async () => ({ ok: true }));
    const app = createPolicyApp(
      createCapabilityRegistry({
        "commerce.orders.cancel": {
          handler,
          kind: "command",
          permission: PERMISSIONS.COMMERCE_ORDERS_MANAGE,
        },
      }),
    );
    const response = await app.request("/commerce.orders.cancel", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt("admin-1")}`,
        "x-test-verified-user": "admin-1",
        "content-type": "application/json",
        "Idempotency-Key": "no-store",
      },
      body: JSON.stringify({ input: {} }),
    });
    expect(response.status).toBe(503);
    expect(handler).not.toHaveBeenCalled();
  });

  it("checks resource authorization before a stored command result can replay", async () => {
    const idempotency = createFakeIdempotency();
    const authorize = vi.fn(async () => false);
    const handler = vi.fn(async () => ({ ok: true }));
    const app = createPolicyApp(
      createCapabilityRegistry({
        "commerce.orders.cancel": {
          handler,
          kind: "command",
          permission: PERMISSIONS.COMMERCE_ORDERS_MANAGE,
          extension: "commerce",
          authorize,
        },
      }),
      { isExtensionInstalled: async () => true },
      idempotency,
    );
    const response = await app.request("/commerce.orders.cancel", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt("admin-1")}`,
        "x-test-verified-user": "admin-1",
        "content-type": "application/json",
        "Idempotency-Key": "resource-check",
      },
      body: JSON.stringify({ input: { orderId: "not-an-order" } }),
    });
    expect(response.status).toBe(404);
    expect(authorize).toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
  });

  it("binds command idempotency to the authenticated actor", async () => {
    let calls = 0;
    const app = createPolicyApp(
      createCapabilityRegistry({
        "commerce.orders.cancel": {
          handler: async () => ({ call: ++calls }),
          kind: "command",
          permission: PERMISSIONS.COMMERCE_ORDERS_MANAGE,
          extension: "commerce",
        },
      }),
      { isExtensionInstalled: async () => true },
      createFakeIdempotency(),
    );
    const request = (actorId: string) =>
      app.request("/commerce.orders.cancel", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwt(actorId)}`,
          "x-test-verified-user": actorId,
          "content-type": "application/json",
          "Idempotency-Key": "shared-command-key",
        },
        body: JSON.stringify({ input: { orderId: "order-1", expectedRevision: 1 } }),
      });
    expect((await request("admin-1")).status).toBe(200);
    expect((await request("admin-2")).status).toBe(409);
    expect(calls).toBe(1);
  });
});
