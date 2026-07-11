import { Hono } from "hono";
import { getTenantId } from "../../shared/tenant";
import { ok, created, notFound } from "../../shared/respond";
import type { FlagService, CreateFlagInput, UpdateFlagInput, FlagEvaluationContext } from "./ports";

export function createFlagRoutes(service: FlagService) {
  const routes = new Hono();

  routes.post("/", async (c) => {
    const tenantId = getTenantId(c);
    const body = await c.req.json<CreateFlagInput>();
    const flag = await service.create(tenantId, body);
    return created(c, flag);
  });

  routes.get("/", async (c) => {
    const tenantId = getTenantId(c);
    const status = c.req.query("status");
    const type = c.req.query("type");
    const schemaId = c.req.query("schemaId");
    const flags = await service.list(tenantId, {
      status: status as FlagFilters["status"],
      type: type as FlagFilters["type"],
      schemaId: schemaId === "" ? null : schemaId ?? undefined,
    });
    return ok(c, flags);
  });

  routes.get("/:id", async (c) => {
    const tenantId = getTenantId(c);
    const flag = await service.get(tenantId, c.req.param("id"));
    return flag ? ok(c, flag) : notFound(c);
  });

  routes.put("/:id", async (c) => {
    const tenantId = getTenantId(c);
    const body = await c.req.json<UpdateFlagInput>();
    const flag = await service.update(tenantId, c.req.param("id"), body);
    return ok(c, flag);
  });

  routes.delete("/:id", async (c) => {
    const tenantId = getTenantId(c);
    const flag = await service.archive(tenantId, c.req.param("id"));
    return ok(c, flag);
  });

  routes.post("/evaluate", async (c) => {
    const tenantId = getTenantId(c);
    const { context, flagKeys } = await c.req.json<{ context: FlagEvaluationContext; flagKeys?: string[] }>();
    const evaluations = await service.evaluate(tenantId, context, flagKeys);
    return ok(c, { evaluations });
  });

  routes.post("/evaluate-batch", async (c) => {
    const tenantId = getTenantId(c);
    const { contexts, flagKeys } = await c.req.json<{ contexts: FlagEvaluationContext[]; flagKeys?: string[] }>();
    const results = await service.evaluateBatch(tenantId, contexts, flagKeys);
    return ok(c, { results });
  });

  routes.get("/:id/evaluations", async (c) => {
    const tenantId = getTenantId(c);
    const from = c.req.query("from");
    const to = c.req.query("to");
    const contextHash = c.req.query("contextHash");
    const evaluationRecords = await service.listEvaluations(tenantId, c.req.param("id"), {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      contextHash: contextHash || undefined,
    });
    return ok(c, evaluationRecords);
  });

  return routes;
}

// Re-export needed for route file only.
import type { FlagFilters } from "./ports";
