import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { getOrgId } from "../../shared/org";
import { created, notFound, ok } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import type { MachineDefinition, MachineEngine } from "./ports";

export function createMachineRoutes(engine: MachineEngine) {
  const routes = new Hono();

  routes.get("/definitions", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_DEFINE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const definitions = await engine.listDefinitions(orgId);
    return ok(c, definitions);
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
    const instances = await engine.listInstances(orgId);
    return ok(c, instances);
  });

  routes.get("/instances/:id", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.STOREFRONT_VIEW);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const instance = await engine.getInstance(orgId, c.req.param("id"));
    return instance ? ok(c, instance) : notFound(c);
  });

  return routes;
}
