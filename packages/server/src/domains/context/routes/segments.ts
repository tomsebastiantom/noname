import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { ContextRouteDeps } from "./deps";

export function registerContextSegmentRoutes(routes: Hono, deps: ContextRouteDeps): void {
  const { service } = deps;

  routes.get("/segments", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.TENANT_MANAGE);
    if (denied) return denied;

    const orgId = getOrgId(c);
    const segments = await service.listSegments(orgId);
    return ok(c, segments);
  });
}
