import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { parseLimitOffset } from "../../../shared/pagination";
import { created, notFound, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { MachineRouteDeps } from "./deps";

export function registerMachineInstanceRoutes(routes: Hono, deps: MachineRouteDeps): void {
  const { engine } = deps;

  routes.post("/start", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { machineName, context = {} } = await c.req.json<{
      machineName: string;
      context?: Record<string, unknown>;
    }>();
    const instance = await engine.start(orgId, machineName, context);
    return created(c, instance);
  });

  routes.post("/:id/:event", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const id = c.req.param("id");
    const event = c.req.param("event");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const instance = await engine.transition(orgId, id, event, body);
    return ok(c, instance);
  });

  routes.get("/instances", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const { limit = 50, offset = 0 } = parseLimitOffset(c, { defaultLimit: 50, maxLimit: 200 });
    const all = await engine.listInstances(orgId);
    return ok(c, all.slice(offset, offset + limit));
  });

  routes.get("/instances/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const instance = await engine.getInstance(orgId, c.req.param("id"));
    return instance ? ok(c, instance) : notFound(c);
  });
}
