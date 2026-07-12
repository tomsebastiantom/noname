import { Hono } from "hono";
import { getTenantId } from "../../shared/tenant";
import { ok, created, notFound } from "../../shared/respond";
import type { AgentService } from "./ports";

export function createAgentRoutes(service: AgentService) {
  const routes = new Hono();

  routes.post("/tasks", async (c) => {
    const tenantId = getTenantId(c);
    const body = await c.req.json();
    const task = await service.create(tenantId, body);
    return created(c, task);
  });

  routes.get("/tasks", async (c) => {
    const tenantId = getTenantId(c);
    const status = c.req.query("status");
    const type = c.req.query("type");
    const tasks = await service.list(tenantId, { status, type } as any);
    return ok(c, tasks);
  });

  routes.get("/tasks/:id", async (c) => {
    const tenantId = getTenantId(c);
    const task = await service.get(tenantId, c.req.param("id"));
    return task ? ok(c, task) : notFound(c);
  });

  routes.put("/tasks/:id/approve", async (c) => {
    const tenantId = getTenantId(c);
    const task = await service.approve(tenantId, c.req.param("id"));
    return ok(c, task);
  });

  routes.put("/tasks/:id/reject", async (c) => {
    const tenantId = getTenantId(c);
    const task = await service.reject(tenantId, c.req.param("id"));
    return ok(c, task);
  });

  return routes;
}
