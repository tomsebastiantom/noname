import { Hono } from "hono";

export function createMachineRoutes() {
  const routes = new Hono();

  routes.get("/definitions", (c) => c.json([]));
  routes.post("/definitions", (c) => c.json({}, 201));

  routes.post("/:machine/:transition", async (c) => {
    const tenantId = c.req.header("x-tenant-id") || "";
    const body = await c.req.json();
    return c.json({
      machine: c.req.param("machine"),
      transition: c.req.param("transition"),
      state: "executed",
      tenantId,
      params: body,
    });
  });

  routes.get("/instances", (c) => c.json([]));
  routes.get("/instances/:id", (c) => c.json({}));

  return routes;
}