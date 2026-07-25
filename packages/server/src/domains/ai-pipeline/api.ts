import { Hono } from "hono";
import { created } from "../../shared/respond";
import { getTenantId } from "../../shared/tenant";
import type { AIPipeline } from "./ports";

export function createAIPipelineRoutes(pipeline: AIPipeline) {
  const routes = new Hono();

  routes.post("/generate/layout", async (c) => {
    const tenantId = getTenantId(c);
    const { prompt, context = {} } = await c.req.json<{
      prompt: string;
      context?: Record<string, unknown>;
    }>();
    const result = await pipeline.generateLayout(tenantId, prompt, context);
    return created(c, result);
  });

  routes.post("/generate/content", async (c) => {
    const tenantId = getTenantId(c);
    const { contentType, prompt } = await c.req.json<{ contentType: string; prompt: string }>();
    const result = await pipeline.generateContent(tenantId, contentType, prompt);
    return created(c, result);
  });

  routes.post("/generate/machine", async (c) => {
    const tenantId = getTenantId(c);
    const { machineName, description } = await c.req.json<{
      machineName: string;
      description: string;
    }>();
    const result = await pipeline.generateMachine(tenantId, machineName, description);
    return created(c, result);
  });

  return routes;
}
