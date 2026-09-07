import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { ConflictError } from "../../../shared/domain-error";
import { getOrgId } from "../../../shared/org";
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

function hasAuthHeader(c: { req: { header: (name: string) => string | undefined } }): boolean {
  return Boolean(c.req.header("Authorization")?.trim());
}

async function requireCartInstance(
  engine: MachineRouteDeps["engine"],
  orgId: string,
  id: string,
): Promise<{ id: string } | null> {
  let instance: { machineName?: string } | null;
  try {
    instance = await engine.getInstance(orgId, id);
  } catch {
    return null;
  }
  if (!instance || instance.machineName !== CART_MACHINE) return null;
  return { id };
}

export function registerMachineInstanceRoutes(routes: Hono, deps: MachineRouteDeps): void {
  const { engine, tenantSettings } = deps;

  // --- Scoped public cart lane (registered before generic routes) ---
  // JWT → signed-in user path. Else valid publishable key → guest path.
  // Neither → 401. Claim always requires JWT.

  routes.post("/cart/start", async (c) => {
    const orgId = getOrgId(c);
    const { context = {} } = await c.req.json<{
      context?: Record<string, unknown>;
    }>();
    if (hasAuthHeader(c)) {
      const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
      if (denied) return denied;
      const instance = await engine.start(orgId, CART_MACHINE, context);
      return created(c, instance);
    }
    const guest = await requirePublicActor(c, orgId, tenantSettings);
    if (!guest) {
      const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
      if (denied) return denied;
    }
    const instance = await engine.start(orgId, CART_MACHINE, { ...context, guest: true });
    return created(c, instance);
  });

  routes.get("/cart/:id", async (c) => {
    const orgId = getOrgId(c);
    const id = c.req.param("id");
    const cart = await requireCartInstance(engine, orgId, id);
    if (!cart) return notFound(c);
    if (hasAuthHeader(c)) {
      const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
      if (denied) return denied;
    } else {
      const guest = await requirePublicActor(c, orgId, tenantSettings);
      if (!guest) {
        const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
        if (denied) return denied;
      }
    }
    const instance = await engine.getInstance(orgId, id);
    return instance ? ok(c, instance) : notFound(c);
  });

  routes.post("/cart/:id/:event", async (c) => {
    const orgId = getOrgId(c);
    const id = c.req.param("id");
    const event = c.req.param("event");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const cart = await requireCartInstance(engine, orgId, id);
    if (!cart) return notFound(c);
    if (event === "claim" || hasAuthHeader(c)) {
      // Ownership assignment always requires auth; a cart can only be claimed
      // once (no cart theft via UUID).
      const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
      if (denied) return denied;
      if (event === "claim") {
        const current = await engine.getInstance(orgId, id);
        const owner = (current?.context as Record<string, unknown> | undefined)?.ownerUserId;
        const requester = typeof body.ownerUserId === "string" ? body.ownerUserId : "";
        if (typeof owner === "string" && owner && owner !== requester) {
          throw new ConflictError("Cart already claimed by another user");
        }
      }
    } else {
      const guest = await requirePublicActor(c, orgId, tenantSettings);
      if (!guest) {
        const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
        if (denied) return denied;
      }
    }
    const instance = await engine.transition(orgId, id, event, body);
    return ok(c, instance);
  });

  // --- Generic machine routes (JWT-only, unchanged) ---

  routes.post("/start", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { machineName, context = {} } = await c.req.json<{
      machineName: string;
      context?: Record<string, unknown>;
    }>();
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
    const instance = await engine.transition(orgId, id, event, body);
    return ok(c, instance);
  });

  routes.get("/instances", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { limit = 50, offset = 0 } = parseLimitOffset(c, { defaultLimit: 50, maxLimit: 200 });
    const all = await engine.listInstances(orgId);
    return ok(c, all.slice(offset, offset + limit));
  });

  routes.get("/instances/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const instance = await engine.getInstance(orgId, c.req.param("id"));
    return instance ? ok(c, instance) : notFound(c);
  });
}
