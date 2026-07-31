import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { created } from "../../../shared/respond";
import type { ContextSignal } from "../ports";
import type { ContextRouteDeps } from "./deps";

export function registerContextResolveRoutes(routes: Hono, deps: ContextRouteDeps): void {
  const { service } = deps;

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
}
