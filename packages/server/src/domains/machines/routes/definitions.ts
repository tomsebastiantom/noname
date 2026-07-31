import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { created, ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { MachineDefinition } from "../ports";
import type { MachineRouteDeps } from "./deps";

export function registerMachineDefinitionRoutes(routes: Hono, deps: MachineRouteDeps): void {
  const { engine } = deps;

  routes.get("/definitions", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_DEFINE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    return ok(c, await engine.listDefinitions(orgId));
  });

  routes.post("/definitions", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_DEFINE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const body = await c.req.json<MachineDefinition>();
    const saved = await engine.define(orgId, body);
    return created(c, saved);
  });

  routes.get("/definitions/:name", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_DEFINE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const definition = await engine.load(orgId, c.req.param("name"));
    return ok(c, definition);
  });
}
