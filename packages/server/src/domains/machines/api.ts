import { Hono } from "hono";
import { getTenantId } from "../../shared/tenant";
import { ok, created, notFound } from "../../shared/respond";
import type { MachineDefinition, MachineEngine } from "./ports";

export function createMachineRoutes(engine: MachineEngine) {
  const routes = new Hono();

  routes.get("/definitions", async (c) => {
    // TODO: listDefinitions should be added to MachineEngine port.
    return ok(c, []);
  });

  routes.post("/definitions", async (c) => {
    const tenantId = getTenantId(c);
    const body = await c.req.json<MachineDefinition>();
    const saved = await engine.define(tenantId, body);
    return created(c, saved);
  });

  routes.get("/definitions/:name", async (c) => {
    const tenantId = getTenantId(c);
    const definition = await engine.load(tenantId, c.req.param("name"));
    return ok(c, definition);
  });

  routes.post("/start", async (c) => {
    const tenantId = getTenantId(c);
    const { machineName, context = {} } = await c.req.json<{
      machineName: string;
      context?: Record<string, unknown>;
    }>();
    const instance = await engine.start(tenantId, machineName, context);
    return created(c, instance);
  });

  routes.post("/:id/:event", async (c) => {
    const tenantId = getTenantId(c);
    const id = c.req.param("id");
    const event = c.req.param("event");
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const instance = await engine.transition(tenantId, id, event, body);
    return ok(c, instance);
  });

  routes.get("/instances", async (c) => {
    const tenantId = getTenantId(c);
    const instances = await engine.listInstances(tenantId);
    return ok(c, instances);
  });

  routes.get("/instances/:id", async (c) => {
    const tenantId = getTenantId(c);
    const instance = await engine.getInstance(tenantId, c.req.param("id"));
    return instance ? ok(c, instance) : notFound(c);
  });

  return routes;
}
