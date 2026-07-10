import { Hono } from "hono";

export function createContextRoutes(engine: unknown) {
  const routes = new Hono();

  routes.post("/resolve", (c) => c.json({}));
  routes.get("/segments", (c) => c.json([]));

  return routes;
}