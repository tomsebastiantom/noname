import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { getOrgId } from "../../shared/org";
import { created, ok } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import type { ContextService, ContextSignal } from "./ports";

export function createContextRoutes(service: ContextService) {
  const routes = new Hono();

  routes.post("/resolve", async (c) => {
    const orgId = getOrgId(c);
    const signals = await c.req.json<ContextSignal[]>();
    const segment = await service.resolve(signals, orgId);
    return created(c, segment);
  });

  routes.post("/segment-from-request", async (c) => {
    const orgId = getOrgId(c);
    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    const segment = await service.segmentForRequest(orgId, headers);
    return created(c, segment);
  });

  routes.get("/segments", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.TENANT_MANAGE);
    if (denied) return denied;

    const orgId = getOrgId(c);
    const segments = await service.listSegments(orgId);
    return ok(c, segments);
  });

  return routes;
}
