import { PERMISSIONS, type PermissionKey, writeAuditFromActor } from "@noname/auth";
import type { Context, Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { created, ok } from "../../../shared/respond";
import { requireHumanPermission } from "../../auth/guards";
import type { AgentRegistryStorage } from "../adapters/registry-postgres";
import type { AgentTaskFilters, AgentTaskType } from "../ports";
import {
  canReviewAgentTask,
  isRegisteredAgentOwner,
  isStoreAgentAdmin,
} from "../task-review-guard";
import type { AgentRouteDeps } from "./deps";

type TaskRouteAuth = {
  userId: string;
  userToken: string;
  permissions: PermissionKey[];
};

async function requireTaskListAccess(c: Context): Promise<TaskRouteAuth | Response> {
  return requireHumanPermission(c, PERMISSIONS.CONTENT_DRAFT_WRITE);
}

async function listFiltersForActor(
  orgId: string,
  auth: TaskRouteAuth,
  registry: AgentRegistryStorage,
  query: Record<string, string | undefined>,
): Promise<AgentTaskFilters> {
  const filters: AgentTaskFilters = {};
  if (query.status) filters.status = query.status as AgentTaskFilters["status"];
  if (query.type) filters.type = query.type as AgentTaskFilters["type"];
  if (isStoreAgentAdmin(auth.permissions)) return filters;

  const ownedAgentIds = (await registry.list(orgId))
    .filter((agent) => agent.ownerUserId === auth.userId)
    .map((agent) => agent.id);
  filters.registeredAgentIds = ownedAgentIds;
  return filters;
}

export function registerAgentTaskRoutes(routes: Hono, deps: AgentRouteDeps): void {
  const { service, registryStorage } = deps;
  if (!registryStorage) {
    throw new Error("Agent task routes require registryStorage");
  }

  routes.post("/tasks", async (c) => {
    const auth = await requireTaskListAccess(c);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    const body = await c.req.json<{
      type: string;
      prompt: string;
      input?: Record<string, unknown>;
      registeredAgentId?: string | null;
    }>();
    const registeredAgentId = body.registeredAgentId ?? null;
    if (registeredAgentId) {
      const allowed =
        isStoreAgentAdmin(auth.permissions) ||
        (await isRegisteredAgentOwner(registryStorage, orgId, registeredAgentId, auth.userId));
      if (!allowed) return c.json({ error: "Forbidden" }, 403);
    } else if (!isStoreAgentAdmin(auth.permissions)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    if (body.type === "orchestrate" && !registeredAgentId) {
      return c.json({ error: "orchestrate tasks require registeredAgentId" }, 400);
    }
    const audit = writeAuditFromActor({
      type: "human",
      userId: auth.userId,
      permissions: auth.permissions,
    });
    const task = await service.create(
      orgId,
      {
        type: body.type as AgentTaskType,
        prompt: body.prompt,
        input: body.input,
        registeredAgentId,
      },
      audit,
    );
    return created(c, task);
  });

  routes.get("/tasks", async (c) => {
    const auth = await requireTaskListAccess(c);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    const filters = await listFiltersForActor(orgId, auth, registryStorage, c.req.query());
    const tasks = await service.list(orgId, filters);
    return ok(c, tasks);
  });

  routes.get("/tasks/:id", async (c) => {
    const auth = await requireTaskListAccess(c);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    const task = await service.get(orgId, c.req.param("id"));
    if (!task) return c.json({ error: "Not found" }, 404);
    const allowed = await canReviewAgentTask(
      registryStorage,
      orgId,
      task,
      auth.userId,
      auth.permissions,
    );
    if (!allowed) return c.json({ error: "Forbidden" }, 403);
    return ok(c, task);
  });

  routes.put("/tasks/:id/approve", async (c) => {
    const auth = await requireTaskListAccess(c);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    const task = await service.get(orgId, c.req.param("id"));
    if (!task) return c.json({ error: "Not found" }, 404);
    const allowed = await canReviewAgentTask(
      registryStorage,
      orgId,
      task,
      auth.userId,
      auth.permissions,
    );
    if (!allowed) return c.json({ error: "Forbidden" }, 403);
    const audit = writeAuditFromActor({
      type: "human",
      userId: auth.userId,
      permissions: auth.permissions,
    });
    const approved = await service.approve(orgId, c.req.param("id"), audit);
    return ok(c, approved);
  });

  routes.put("/tasks/:id/reject", async (c) => {
    const auth = await requireTaskListAccess(c);
    if (auth instanceof Response) return auth;
    const orgId = getOrgId(c);
    const task = await service.get(orgId, c.req.param("id"));
    if (!task) return c.json({ error: "Not found" }, 404);
    const allowed = await canReviewAgentTask(
      registryStorage,
      orgId,
      task,
      auth.userId,
      auth.permissions,
    );
    if (!allowed) return c.json({ error: "Forbidden" }, 403);
    const audit = writeAuditFromActor({
      type: "human",
      userId: auth.userId,
      permissions: auth.permissions,
    });
    const rejected = await service.reject(orgId, c.req.param("id"), audit);
    return ok(c, rejected);
  });
}
