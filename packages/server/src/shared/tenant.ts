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

export const tenantMiddleware: MiddlewareHandler = async (c, next) => {
  c.set(TENANT_ID_KEY, c.req.header("x-tenant-id") || "");
  c.set(USER_ID_KEY, c.req.header("x-user-id") || "");
  c.set(ROLE_KEY, c.req.header("x-role") || "");
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
