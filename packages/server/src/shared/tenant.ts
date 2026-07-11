import type { Context, MiddlewareHandler } from "hono";

export const TENANT_ID_KEY = "tenantId";

declare module "hono" {
  interface ContextVariableMap {
    tenantId: string;
  }
}

export const tenantMiddleware: MiddlewareHandler = async (c, next) => {
  c.set(TENANT_ID_KEY, c.req.header("x-tenant-id") || "");
  await next();
};

export function getTenantId(c: Context): string {
  return c.get(TENANT_ID_KEY);
}
