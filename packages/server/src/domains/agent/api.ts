import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { getOrgId } from "../../shared/org";
import { created, ok } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import type { AgentService } from "./ports";

export function createAgentRoutes(service: AgentService) {
  const routes = new Hono();

  routes.post("/tasks", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.AGENT_MANAGE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const body = await c.req.json();
    const task = await service.create(orgId, body);
    return created(c, task);
  });

  routes.get("/tasks", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.AGENT_MANAGE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const status = c.req.query("status");
    const type = c.req.query("type");
    const tasks = await service.list(orgId, { status, type } as any);
    return ok(c, tasks);
  });

  routes.get("/tasks/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.AGENT_MANAGE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const task = await service.get(orgId, c.req.param("id"));
    return ok(c, task);
  });

  routes.put("/tasks/:id/approve", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.AGENT_MANAGE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const task = await service.approve(orgId, c.req.param("id"));
    return ok(c, task);
  });

  routes.put("/tasks/:id/reject", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.AGENT_MANAGE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const task = await service.reject(orgId, c.req.param("id"));
    return ok(c, task);
  });

  return routes;
}
