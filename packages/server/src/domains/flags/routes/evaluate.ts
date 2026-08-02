import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId, requireHeaderOrgId } from "../../../shared/org";
import { ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { FlagEvaluationContext } from "../ports";
import type { FlagRouteDeps } from "./deps";

export function registerFlagEvaluateRoutes(routes: Hono, deps: FlagRouteDeps): void {
  const { service } = deps;

  routes.post("/evaluate", async (c) => {
    const body = await c.req.json<{
      context?: Partial<FlagEvaluationContext>;
      flagKeys?: string[];
      keys?: string[];
    }>();
    const orgId = requireHeaderOrgId(c);
    if (orgId instanceof Response) return orgId;
    const flagKeys = body.flagKeys ?? body.keys;
    const evaluations = await service.evaluate(orgId, body.context ?? {}, flagKeys);
    return ok(c, { evaluations });
  });

  routes.post("/evaluate-batch", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { contexts, flagKeys } = await c.req.json<{
      contexts: FlagEvaluationContext[];
      flagKeys?: string[];
    }>();
    const results = await service.evaluateBatch(orgId, contexts, flagKeys);
    return ok(c, { results });
  });
}
