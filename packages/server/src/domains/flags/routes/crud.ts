import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { created, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { CreateFlagInput, FlagFilters, UpdateFlagInput } from "../ports";
import type { FlagRouteDeps } from "./deps";

export function registerFlagCrudRoutes(routes: Hono, deps: FlagRouteDeps): void {
  const { service } = deps;

  routes.post("/", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.FLAGS_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const body = await c.req.json<CreateFlagInput>();
    const flag = await service.create(orgId, body);
    return created(c, flag);
  });

  routes.get("/", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.FLAGS_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const status = c.req.query("status");
    const type = c.req.query("type");
    const schemaId = c.req.query("schemaId");
    const flags = await service.list(orgId, {
      status: status as FlagFilters["status"],
      type: type as FlagFilters["type"],
      schemaId: schemaId === "" ? null : (schemaId ?? undefined),
    });
    return ok(c, flags);
  });

  routes.get("/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.FLAGS_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const flag = await service.get(orgId, c.req.param("id"));
    return ok(c, flag);
  });

  routes.put("/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.FLAGS_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const body = await c.req.json<UpdateFlagInput>();
    const flag = await service.update(orgId, c.req.param("id"), body);
    return ok(c, flag);
  });

  routes.delete("/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.FLAGS_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const flag = await service.archive(orgId, c.req.param("id"));
    return ok(c, flag);
  });

  routes.get("/:id/evaluations", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.FLAGS_WRITE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const from = c.req.query("from");
    const to = c.req.query("to");
    const contextHash = c.req.query("contextHash");
    const evaluationRecords = await service.listEvaluations(orgId, c.req.param("id"), {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      contextHash: contextHash || undefined,
    });
    return ok(c, evaluationRecords);
  });
}
