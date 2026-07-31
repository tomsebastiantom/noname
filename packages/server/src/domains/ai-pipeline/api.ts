import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { getOrgId } from "../../shared/org";
import { created } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import type { AIPipeline } from "./ports";

export function createAIPipelineRoutes(pipeline: AIPipeline) {
  const routes = new Hono();

  routes.post("/generate/layout", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.AGENT_MANAGE);
    if (denied) return denied;

    const orgId = getOrgId(c);
    const { prompt, context = {} } = await c.req.json<{
      prompt: string;
      context?: Record<string, unknown>;
    }>();
    const result = await pipeline.generateLayout(orgId, prompt, context);
    return created(c, result);
  });

  routes.post("/generate/content", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.AGENT_MANAGE);
    if (denied) return denied;

    const orgId = getOrgId(c);
    const { contentType, prompt } = await c.req.json<{ contentType: string; prompt: string }>();
    const result = await pipeline.generateContent(orgId, contentType, prompt);
    return created(c, result);
  });

  routes.post("/generate/machine", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.AGENT_MANAGE);
    if (denied) return denied;

    const orgId = getOrgId(c);
    const { machineName, description } = await c.req.json<{
      machineName: string;
      description: string;
    }>();
    const result = await pipeline.generateMachine(orgId, machineName, description);
    return created(c, result);
  });

  return routes;
}
