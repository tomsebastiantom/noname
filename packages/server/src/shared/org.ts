import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";

export const ORG_ID_KEY = "orgId";
export const USER_ID_KEY = "userId";
export const ROLE_KEY = "role";

declare module "hono" {
  interface ContextVariableMap {
    orgId: string;
    userId: string;
    role: string;
  }
}

const secret = process.env.WORKER_SERVER_SECRET || "";

function edgeHmacRequired(): boolean {
  return process.env.REQUIRE_EDGE_HMAC === "true";
}

function verifyHmac(orgId: string, userId: string, role: string, providedHmac: string): boolean {
  if (!secret) return false;
  const payload = `${orgId}:${userId}:${role}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(providedHmac));
  } catch {
    return false;
  }
}

export const orgMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.req.path === "/health") {
    await next();
    return;
  }

  const orgId = c.req.header("x-org-id") || "";
  const userId = c.req.header("x-user-id") || "";
  const role = c.req.header("x-role") || "";
  const hmac = c.req.header("x-auth-hmac") || "";

  if (hmac) {
    if (!verifyHmac(orgId, userId, role, hmac)) {
      return c.json({ error: "Invalid auth signature" }, 401);
    }
  } else if (edgeHmacRequired()) {
    return c.json({ error: "Request must come through edge worker" }, 401);
  } else if (secret && c.req.path !== "/health") {
    console.warn("No HMAC on request — may bypass edge worker");
  }

  c.set(ORG_ID_KEY, orgId);
  c.set(USER_ID_KEY, userId);
  c.set(ROLE_KEY, role);
  await next();
};

export function getOrgId(c: Context): string {
  return c.get(ORG_ID_KEY);
}

/** Prefer authenticated/proxied header; fall back to URL param (subdomain routing). */
export function resolveOrgId(c: Context, paramOrgId: string): string {
  return getOrgId(c) || paramOrgId;
}

export function getUserId(c: Context): string {
  return c.get(USER_ID_KEY);
}

export function getRole(c: Context): string {
  return c.get(ROLE_KEY);
}

/** Org from edge-signed x-org-id only — never from body or query. */
export function requireHeaderOrgId(c: Context): string | Response {
  const orgId = getOrgId(c);
  if (!orgId) {
    return c.json({ error: "org id required" }, 400);
  }
  return orgId;
}
