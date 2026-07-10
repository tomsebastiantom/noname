import { Hono } from "hono";

export function createEdgeRoutes() {
  const routes = new Hono();

  routes.get("/schema/:siteId", (c) => c.json({}));
  routes.post("/personalize", (c) => c.json({}));

  return routes;
}