import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { created, notFound, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { DocumentsRouteDeps } from "./deps";

export function registerContentTypeRoutes(routes: Hono, deps: DocumentsRouteDeps): void {
  const { contentTypes } = deps.service;

  routes.post("/content-types", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.AUTH_MANAGE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { name, schema } = await c.req.json<{ name: string; schema: Record<string, unknown> }>();
    const createdType = await contentTypes.create(orgId, name, schema as never);
    return created(c, createdType);
  });

  routes.get("/content-types", async (c) => {
    const orgId = getOrgId(c);
    return ok(c, await contentTypes.list(orgId));
  });

  routes.get("/content-types/:name", async (c) => {
    const orgId = getOrgId(c);
    const found = await contentTypes.get(orgId, c.req.param("name"));
    return found ? ok(c, found) : notFound(c);
  });

  routes.put("/content-types/:name", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.AUTH_MANAGE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { schema } = await c.req.json<{ schema: Record<string, unknown> }>();
    const updated = await contentTypes.update(orgId, c.req.param("name"), schema as never);
    return ok(c, updated);
  });
}
