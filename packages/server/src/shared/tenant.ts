import { createHmac, timingSafeEqual } from "node:crypto";
import type { Context, MiddlewareHandler } from "hono";

export const TENANT_ID_KEY = "tenantId";
export const USER_ID_KEY = "userId";
export const ROLE_KEY = "role";

declare module "hono" {
  interface ContextVariableMap {
    tenantId: string;
    userId: string;
    role: string;
  }
}

const secret = process.env.WORKER_SERVER_SECRET || "";

function verifyHmac(tenantId: string, userId: string, role: string, providedHmac: string): boolean {
  if (!secret) return false;
  const payload = `${tenantId}:${userId}:${role}`;
  const expected = createHmac("sha256", secret).update(payload).digest("base64");
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(providedHmac));
  } catch {
    return false;
  }
}

export const tenantMiddleware: MiddlewareHandler = async (c, next) => {
  if (c.req.path === "/health") {
    await next();
    return;
  }

  const tenantId = c.req.header("x-tenant-id") || "";
  const userId = c.req.header("x-user-id") || "";
  const role = c.req.header("x-role") || "";
  const hmac = c.req.header("x-auth-hmac") || "";

  if (hmac) {
    if (!verifyHmac(tenantId, userId, role, hmac)) {
      return c.json({ error: "Invalid auth signature" }, 401);
    }
  } else if (secret && c.req.path !== "/health") {
    console.warn("No HMAC on request — may bypass edge worker");
  }

  c.set(TENANT_ID_KEY, tenantId);
  c.set(USER_ID_KEY, userId);
  c.set(ROLE_KEY, role);
  await next();
};

export function getTenantId(c: Context): string {
  return c.get(TENANT_ID_KEY);
}

export function getUserId(c: Context): string {
  return c.get(USER_ID_KEY);
}

export function getRole(c: Context): string {
  return c.get(ROLE_KEY);
}
