import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMachineRoutes } from "../api";
import type { MachineEngine, MachineInstanceDTO } from "../ports";

vi.mock("../../auth/deny-unless", () => ({ denyUnless: async () => null }));

const cartId = "cart-1";
const instant = new Date("2026-01-01T00:00:00Z");

function fixture() {
  const instances = new Map<string, MachineInstanceDTO>();
  const transition = vi.fn(async (_orgId: string, id: string, _event: string, params = {}) => {
    const current = instances.get(id);
    if (!current) throw new Error("not found");
    const updated = { ...current, context: { ...current.context, ...params }, updatedAt: instant };
    instances.set(id, updated);
    return updated;
  });
  const start = vi.fn(
    async (orgId: string, machineName: string, context: Record<string, unknown>) => {
      const instance: MachineInstanceDTO = {
        id: cartId,
        orgId,
        machineName,
        currentState: "active",
        context,
        createdAt: instant,
        updatedAt: instant,
      };
      instances.set(cartId, instance);
      return instance;
    },
  );
  const engine = {
    start,
    transition,
    getInstance: async (_orgId: string, id: string) => instances.get(id) ?? null,
  } as unknown as MachineEngine;
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("orgId", "org-1");
    c.set("userId", c.req.header("x-test-verified-user") ?? "");
    await next();
  });
  app.onError((cause, c) => c.json({ error: cause.message }, 409));
  app.route(
    "/",
    createMachineRoutes(engine, { get: async () => ({ publishableKey: "store-key" }) } as never),
  );
  return { app, instances, start, transition };
}

function requestHeaders(userId?: string, publishable = true): HeadersInit {
  return {
    "content-type": "application/json",
    ...(userId ? { "x-test-verified-user": userId, Authorization: "Bearer verified" } : {}),
    ...(publishable ? { "x-publishable-key": "store-key" } : {}),
  };
}

async function startCart(
  app: Hono,
  userId?: string,
  context: Record<string, unknown> = {},
): Promise<Response> {
  return app.request("/cart/start", {
    method: "POST",
    headers: requestHeaders(userId),
    body: JSON.stringify({ context }),
  });
}

async function seedCart(
  instances: Map<string, MachineInstanceDTO>,
  context: Record<string, unknown>,
): Promise<void> {
  instances.set(cartId, {
    id: cartId,
    orgId: "org-1",
    machineName: "cart",
    currentState: "active",
    context,
    createdAt: instant,
    updatedAt: instant,
  });
}

describe("public cart ownership boundary", () => {
  let test: ReturnType<typeof fixture>;

  beforeEach(() => {
    test = fixture();
  });

  it("derives owned-cart start identity and strips client ownership fields", async () => {
    const response = await startCart(test.app, "account-1", {
      items: [],
      ownerUserId: "spoofed-account",
      guest: true,
    });

    expect(response.status).toBe(201);
    expect(test.start).toHaveBeenCalledWith("org-1", "cart", {
      items: [],
      ownerUserId: "account-1",
      guest: false,
    });
  });

  it("forces publishable-key start to an unowned guest cart", async () => {
    const response = await startCart(test.app, undefined, {
      ownerUserId: "spoofed-account",
      guest: false,
      items: [],
    });

    expect(response.status).toBe(201);
    expect(test.start).toHaveBeenCalledWith("org-1", "cart", { items: [], guest: true });
  });

  it("claims guest cart for the verified actor and ignores body owner claims", async () => {
    await seedCart(test.instances, { guest: true, items: [{ productId: "p1", quantity: 1 }] });
    const response = await test.app.request(`/cart/${cartId}/claim`, {
      method: "POST",
      headers: requestHeaders("account-1"),
      body: JSON.stringify({ ownerUserId: "attacker", guest: true }),
    });

    expect(response.status).toBe(200);
    expect(test.transition).toHaveBeenCalledWith("org-1", cartId, "claim", {
      ownerUserId: "account-1",
      guest: false,
    });
  });

  it("denies cross-account reads and updates without disclosing the cart", async () => {
    await seedCart(test.instances, { ownerUserId: "account-1", guest: false, items: [] });

    const read = await test.app.request(`/cart/${cartId}`, {
      headers: requestHeaders("account-2", false),
    });
    const update = await test.app.request(`/cart/${cartId}/addToCart`, {
      method: "POST",
      headers: requestHeaders("account-2", false),
      body: JSON.stringify({ items: [], ownerUserId: "account-2", guest: true }),
    });

    expect(read.status).toBe(404);
    expect(update.status).toBe(404);
    expect(test.transition).not.toHaveBeenCalled();
  });

  it("keeps guest read/update and signed-in guest claim available", async () => {
    await seedCart(test.instances, { guest: true, items: [] });
    const publicRead = await test.app.request(`/cart/${cartId}`, {
      headers: requestHeaders(undefined, true),
    });
    const publicUpdate = await test.app.request(`/cart/${cartId}/addToCart`, {
      method: "POST",
      headers: requestHeaders(undefined, true),
      body: JSON.stringify({ items: [{ productId: "p1", quantity: 1 }], guest: false }),
    });
    const claim = await test.app.request(`/cart/${cartId}/claim`, {
      method: "POST",
      headers: requestHeaders("account-1"),
      body: JSON.stringify({}),
    });
    const publicReadAfterClaim = await test.app.request(`/cart/${cartId}`, {
      headers: requestHeaders(undefined, true),
    });

    expect(publicRead.status).toBe(200);
    expect(publicUpdate.status).toBe(200);
    expect(claim.status).toBe(200);
    expect(publicReadAfterClaim.status).toBe(404);
    expect(test.transition).toHaveBeenNthCalledWith(1, "org-1", cartId, "addToCart", {
      items: [{ productId: "p1", quantity: 1 }],
    });
  });

  it.each([
    "PAYMENT_SUCCEEDED",
    "PAYMENT_FAILED",
  ])("rejects browser/provider-only %s events on public cart routes", async (event) => {
    await seedCart(test.instances, { guest: true });
    const response = await test.app.request(`/cart/${cartId}/${event}`, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({ paymentRef: "spoofed" }),
    });
    expect(response.status).toBe(403);
    expect(test.transition).not.toHaveBeenCalled();
  });

  it("prevents generic machine APIs from bypassing cart ownership and provider restrictions", async () => {
    await seedCart(test.instances, { ownerUserId: "account-1", guest: false });

    const genericRead = await test.app.request(`/instances/${cartId}`, {
      headers: requestHeaders("account-2", false),
    });
    const genericPayment = await test.app.request(`/${cartId}/PAYMENT_SUCCEEDED`, {
      method: "POST",
      headers: requestHeaders("account-1", false),
      body: JSON.stringify({}),
    });
    const genericStart = await test.app.request("/start", {
      method: "POST",
      headers: requestHeaders("account-1", false),
      body: JSON.stringify({
        machineName: "cart",
        context: { ownerUserId: "victim", guest: false },
      }),
    });

    expect(genericRead.status).toBe(404);
    expect(genericPayment.status).toBe(403);
    expect(genericStart.status).toBe(400);
    expect(test.start).not.toHaveBeenCalled();
    expect(test.transition).not.toHaveBeenCalled();
  });

  it("rejects unknown client events", async () => {
    await seedCart(test.instances, { guest: true });
    const response = await test.app.request(`/cart/${cartId}/checkout_started`, {
      method: "POST",
      headers: requestHeaders(),
      body: JSON.stringify({}),
    });
    expect(response.status).toBe(400);
    expect(test.transition).not.toHaveBeenCalled();
  });
});
