import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { ConflictError } from "../../../shared/domain-error";
import { getOrgId, getUserId } from "../../../shared/org";
import { parseLimitOffset } from "../../../shared/pagination";
import { requirePublicActor } from "../../../shared/public-actor";
import { created, notFound, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { MachineRouteDeps } from "./deps";

/**
 * Scoped public endpoints (general pattern — cart is the first user).
 *
 * Any domain that needs anonymous access declares EXPLICIT narrow paths here
 * (never broad regexes over generic resources). Edge lists those exact paths
 * as public; the server re-verifies on every call:
 *
 * - org isolation via edge-signed x-org-id (orgMiddleware),
 * - caller grant via publishable key (`requirePublicActor`, generic helper),
 * - resource check (this file: instance must be a `cart` machine),
 * - sensitive transitions (`claim`) always require JWT.
 *
 * Generic machine routes below stay JWT-only end to end.
 */
const CART_MACHINE = "cart";

const CLIENT_CART_EVENTS = new Set(["addToCart", "clear"]);
const SERVER_CONTEXT_FIELDS = new Set(["ownerUserId", "guest"]);

function withoutServerContextFields(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(
      ([key]) => !SERVER_CONTEXT_FIELDS.has(key),
    ),
  );
}

async function requireCartInstance(
  engine: MachineRouteDeps["engine"],
  orgId: string,
  id: string,
): Promise<Awaited<ReturnType<MachineRouteDeps["engine"]["getInstance"]>>> {
  let instance: Awaited<ReturnType<MachineRouteDeps["engine"]["getInstance"]>>;
  try {
    instance = await engine.getInstance(orgId, id);
  } catch {
    return null;
  }
  if (!instance || instance.machineName !== CART_MACHINE) return null;
  return instance;
}

function isUnownedGuest(instance: { context: Record<string, unknown> }): boolean {
  return !instance.context.ownerUserId && instance.context.guest === true;
}

function canAccessCart(instance: { context: Record<string, unknown> }, userId: string): boolean {
  const owner = instance.context.ownerUserId;
  return typeof owner === "string" && owner.length > 0
    ? owner === userId
    : isUnownedGuest(instance);
}

export function registerMachineInstanceRoutes(routes: Hono, deps: MachineRouteDeps): void {
  const { engine, tenantSettings } = deps;

  // --- Scoped public cart lane (registered before generic routes) ---
  // Verified HMAC identity → owned-cart path. Otherwise, a valid publishable
  // key grants only the unowned guest-cart lane. Claim always requires identity.

  routes.post("/cart/start", async (c) => {
    const orgId = getOrgId(c);
    const { context = {} } = await c.req.json<{
      context?: Record<string, unknown>;
    }>();
    const safeContext = withoutServerContextFields(context);
    const userId = getUserId(c)?.trim();
    if (userId) {
      const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
      if (denied) return denied;
      const instance = await engine.start(orgId, CART_MACHINE, {
        ...safeContext,
        ownerUserId: userId,
        guest: false,
      });
      return created(c, instance);
    }
    const guest = await requirePublicActor(c, orgId, tenantSettings);
    if (!guest) return c.json({ error: "Authentication required" }, 401);
    const instance = await engine.start(orgId, CART_MACHINE, { ...safeContext, guest: true });
    return created(c, instance);
  });

  routes.get("/cart/:id", async (c) => {
    const orgId = getOrgId(c);
    const id = c.req.param("id");
    const cart = await requireCartInstance(engine, orgId, id);
    if (!cart) return notFound(c);
    const userId = getUserId(c)?.trim();
    if (userId) {
      const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
      if (denied) return denied;
      if (!canAccessCart(cart, userId)) return notFound(c);
    } else {
      const guest = await requirePublicActor(c, orgId, tenantSettings);
      if (!guest || !isUnownedGuest(cart)) return notFound(c);
    }
    return ok(c, cart);
  });

  routes.post("/cart/:id/:event", async (c) => {
    const orgId = getOrgId(c);
    const id = c.req.param("id");
    const event = c.req.param("event");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const cart = await requireCartInstance(engine, orgId, id);
    if (!cart) return notFound(c);
    const userId = getUserId(c)?.trim();

    if (event === "PAYMENT_SUCCEEDED" || event === "PAYMENT_FAILED") {
      return c.json({ error: "Provider payment events are not accepted on cart routes" }, 403);
    }
    if (event === "claim") {
      if (!userId) return c.json({ error: "Authentication required" }, 401);
      const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
      if (denied) return denied;
      const owner = cart.context.ownerUserId;
      if (typeof owner === "string" && owner && owner !== userId) {
        throw new ConflictError("Cart already claimed by another user");
      }
      if (!owner && !isUnownedGuest(cart)) {
        throw new ConflictError("Cart cannot be claimed");
      }
      const instance = await engine.transition(orgId, id, event, {
        ownerUserId: userId,
        guest: false,
      });
      return ok(c, instance);
    }

    if (!CLIENT_CART_EVENTS.has(event)) return c.json({ error: "Unsupported cart event" }, 400);
    if (userId) {
      const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
      if (denied) return denied;
      if (!canAccessCart(cart, userId)) return notFound(c);
    } else {
      const guest = await requirePublicActor(c, orgId, tenantSettings);
      if (!guest || !isUnownedGuest(cart)) return notFound(c);
    }
    const instance = await engine.transition(orgId, id, event, withoutServerContextFields(body));
    return ok(c, instance);
  });

  // --- Generic machine routes (JWT-only; cart access remains owner-scoped) ---

  routes.post("/start", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { machineName, context = {} } = await c.req.json<{
      machineName: string;
      context?: Record<string, unknown>;
    }>();
    if (machineName === CART_MACHINE) {
      return c.json({ error: "Use the scoped cart start route" }, 400);
    }
    const instance = await engine.start(orgId, machineName, context);
    return created(c, instance);
  });

  routes.post("/:id/:event", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const id = c.req.param("id");
    const event = c.req.param("event");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const current = await engine.getInstance(orgId, id);
    if (current?.machineName === CART_MACHINE) {
      if (event === "PAYMENT_SUCCEEDED" || event === "PAYMENT_FAILED") {
        return c.json({ error: "Provider payment events are not accepted on cart routes" }, 403);
      }
      const userId = getUserId(c)?.trim();
      if (!userId || !canAccessCart(current, userId)) return notFound(c);
      if (!CLIENT_CART_EVENTS.has(event)) {
        return c.json({ error: "Unsupported cart event; use the scoped cart route" }, 400);
      }
      const instance = await engine.transition(orgId, id, event, withoutServerContextFields(body));
      return ok(c, instance);
    }
    const instance = await engine.transition(orgId, id, event, body);
    return ok(c, instance);
  });

  routes.get("/instances", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { limit = 50, offset = 0 } = parseLimitOffset(c, { defaultLimit: 50, maxLimit: 200 });
    const userId = getUserId(c)?.trim();
    const all = await engine.listInstances(orgId);
    const visible = all.filter(
      (instance) =>
        instance.machineName !== CART_MACHINE || (userId && canAccessCart(instance, userId)),
    );
    return ok(c, visible.slice(offset, offset + limit));
  });

  routes.get("/instances/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const instance = await engine.getInstance(orgId, c.req.param("id"));
    if (!instance) return notFound(c);
    if (instance.machineName === CART_MACHINE) {
      const userId = getUserId(c)?.trim();
      if (!userId || !canAccessCart(instance, userId)) return notFound(c);
    }
    return ok(c, instance);
  });
}
