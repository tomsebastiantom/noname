import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { created, deleted, notFound, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { DocumentsRouteDeps } from "./deps";

export function registerContentRoutes(routes: Hono, deps: DocumentsRouteDeps): void {
  const { content } = deps.service;

  routes.post("/:type", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const type = c.req.param("type");
    const body = await c.req.json<Record<string, unknown>>();
    const createdEntry = await content.create(orgId, type, body, {
      locale: c.req.query("locale"),
      role: c.req.query("role"),
    });
    return created(c, createdEntry);
  });

  routes.get("/:type", async (c) => {
    const orgId = getOrgId(c);
    return ok(c, await content.findByType(orgId, c.req.param("type")));
  });

  routes.get("/:type/:id", async (c) => {
    const orgId = getOrgId(c);
    const { type: _type, id } = c.req.param();
    const found = await content.findById(orgId, id, {
      role: c.req.query("role"),
    });
    return found ? ok(c, found) : notFound(c);
  });

  routes.get("/:type/:id/resolve", async (c) => {
    const orgId = getOrgId(c);
    const { type, id } = c.req.param();
    const resolved = await content.resolve(orgId, type, id, c.req.query("locale") || "en-US");
    return resolved ? ok(c, resolved) : notFound(c);
  });

  routes.put("/:type/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { type, id } = c.req.param();
    const body = await c.req.json<Record<string, unknown>>();
    const updated = await content.updateById(orgId, type, id, body, {
      locale: c.req.query("locale"),
      role: c.req.query("role"),
    });
    return ok(c, updated);
  });

  routes.delete("/:type/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { type, id } = c.req.param();
    await content.deleteById(orgId, type, id);
    return deleted(c);
  });

  routes.put("/:type/:id/publish", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.CONTENT_PUBLISH);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { type, id } = c.req.param();
    const published = await content.publish(orgId, type, id);
    return ok(c, published);
  });
}
