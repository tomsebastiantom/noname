import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { z } from "zod";
import { parseBody } from "../../../shared/parse-body";
import { notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { requireHumanPermission } from "../../auth/guards";
import type { TenantSettingsService } from "../../documents/ports";
import { integrationIdSchema } from "../integration-id";
import type { IntegrationOAuthPort, IntegrationsService } from "../ports";

const sessionSchema = z.object({
  integrationId: integrationIdSchema,
});

export interface IntegrationsNangoRouteDeps {
  service: IntegrationsService;
  tenantSettings?: TenantSettingsService;
  oauth?: IntegrationOAuthPort | null;
}

export function registerIntegrationsNangoRoutes(routes: Hono, deps: IntegrationsNangoRouteDeps): void {
  const { service, tenantSettings, oauth } = deps;

  routes.get("/:orgId/nango/connections", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    return ok(c, await service.getOAuthConnections(orgId));
  });

  routes.post("/:orgId/nango/session", async (c) => {
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("orgId"));
    if (!orgId) return notFound(c);
    const auth = await requireHumanPermission(c, PERMISSIONS.INTEGRATIONS_MANAGE);
    if (auth instanceof Response) return auth;

    const body = parseBody(sessionSchema.safeParse(await c.req.json()), "nango session");
    const session = await service.createOAuthConnectSession(
      orgId,
      auth.userId,
      undefined,
      body.integrationId,
    );
    return ok(c, session);
  });

  routes.post("/nango/webhook", async (c) => {
    if (!oauth?.isConfigured()) {
      return c.json({ error: "OAuth integrations not configured" }, 503);
    }

    const rawBody = await c.req.text();
    const headers = Object.fromEntries(c.req.raw.headers.entries()) as Record<
      string,
      string | undefined
    >;

    if (!oauth.verifyWebhook(rawBody, headers)) {
      return c.json({ error: "Invalid webhook signature" }, 401);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(rawBody) as unknown;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    await service.handleOAuthWebhook(payload);
    return ok(c, { received: true });
  });
}
