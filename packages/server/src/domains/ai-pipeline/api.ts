import { Hono } from "hono";

export function createAIPipelineRoutes(pipeline: unknown) {
  const routes = new Hono();

  routes.post("/generate/layout", (c) => c.json({}, 201));
  routes.post("/generate/content", (c) => c.json({}, 201));
  routes.post("/generate/machine", (c) => c.json({}, 201));

  return routes;
}