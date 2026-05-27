import { Hono } from "hono";
import type { ContentStorage, ContentValidator } from "./ports";
import { createContentService } from "./service";

export function createContentRoutes(storage: ContentStorage, validator: ContentValidator) {
  const engine = createContentService(storage, validator);
  const routes = new Hono();

  routes.post("/types", async (c) => {
    const { name, schema } = await c.req.json();
    const tenantId = c.req.header("x-tenant-id") || "";
    const type = await storage.create(tenantId, "content_type", name, schema);
    return c.json(type, 201);
  });

  routes.get("/types", async (c) => {
    const tenantId = c.req.header("x-tenant-id") || "";
    const types = await storage.findByType(tenantId, "content_type");
    return c.json(types);
  });

  routes.get("/:type", async (c) => {
    const tenantId = c.req.header("x-tenant-id") || "";
    const entries = await engine.findByType(tenantId, c.req.param("type"));
    return c.json(entries);
  });

  routes.post("/:type", async (c) => {
    const tenantId = c.req.header("x-tenant-id") || "";
    const body = await c.req.json();
    const entry = await engine.create(tenantId, c.req.param("type"), body);
    return c.json(entry, 201);
  });

  routes.get("/:type/:slug", async (c) => {
    const tenantId = c.req.header("x-tenant-id") || "";
    const entry = await engine.findBySlug(tenantId, c.req.param("type"), c.req.param("slug"));
    return entry ? c.json(entry) : c.json({ error: "not found" }, 404);
  });

  routes.put("/:type/:slug", async (c) => {
    const tenantId = c.req.header("x-tenant-id") || "";
    const body = await c.req.json();
    await engine.update(tenantId, c.req.param("type"), c.req.param("slug"), body);
    return c.json({ updated: true });
  });

  routes.delete("/:type/:slug", async (c) => {
    const tenantId = c.req.header("x-tenant-id") || "";
    await engine.delete(tenantId, c.req.param("type"), c.req.param("slug"));
    return c.json({ deleted: true }, 200);
  });

  return routes;
}

