import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { z } from "zod";
import { parseBody } from "../../../shared/parse-body";
import { notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { requireHumanPermission } from "../../auth/guards";
import type { TenantSettingsService } from "../../documents/ports";
import type { IntegrationsService } from "../ports";

const llmUpdateSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  apiKey: z.string().optional(),
  allowPlatformFallback: z.boolean().optional(),
});

export interface IntegrationsRouteDeps {
  service: IntegrationsService;
  tenantSettings?: TenantSettingsService;
}

export function registerIntegrationsLlmRoutes(routes: Hono, deps: IntegrationsRouteDeps): void {
  const { service, tenantSettings } = deps;

  routes.get("/:orgId/llm", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    return ok(c, await service.getLlmConfig(orgId));
  });

  routes.put("/:orgId/llm", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;

    const body = parseBody(llmUpdateSchema.safeParse(await c.req.json()), "llm integration");
    return ok(c, await service.updateLlmConfig(orgId, auth.userId, body));
  });
}
