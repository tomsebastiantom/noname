import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { created, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { AgentTaskFilters } from "../ports";
import type { AgentRouteDeps } from "./deps";

export function registerAgentTaskRoutes(routes: Hono, deps: AgentRouteDeps): void {
  const { service } = deps;

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
    const filters: AgentTaskFilters = {};
    if (status) filters.status = status as AgentTaskFilters["status"];
    if (type) filters.type = type as AgentTaskFilters["type"];
    const tasks = await service.list(orgId, filters);
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
}
