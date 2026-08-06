import { COMMS_PROVIDERS } from "@noname/shared";
import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { z } from "zod";
import { parseBody } from "../../../shared/parse-body";
import { notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { requireHumanPermission } from "../../auth/guards";
import type { TenantSettingsService } from "../../documents/ports";
import type { IntegrationsService } from "../ports";

const commsUpdateSchema = z.object({
  emailProvider: z.enum(COMMS_PROVIDERS),
  apiKey: z.string().optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().optional(),
  mailgunDomain: z.string().trim().min(1).optional(),
});

export interface IntegrationsCommsRouteDeps {
  service: IntegrationsService;
  tenantSettings?: TenantSettingsService;
}

export function registerIntegrationsCommsRoutes(
  routes: Hono,
  deps: IntegrationsCommsRouteDeps,
): void {
  const { service, tenantSettings } = deps;

  routes.get("/:orgId/comms", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    return ok(c, await service.getCommsConfig(orgId));
  });

  routes.put("/:orgId/comms", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;

    const body = parseBody(commsUpdateSchema.safeParse(await c.req.json()), "comms integration");
    return ok(c, await service.updateCommsConfig(orgId, auth.userId, body));
  });
}
