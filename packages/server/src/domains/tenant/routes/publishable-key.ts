import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { notFound, ok } from "../../../shared/respond";
import { resolveRouteOrgId } from "../../../shared/site-id";
import { denyUnless } from "../../auth/deny-unless";
import { generatePublishableKey } from "../../documents/services/tenant-settings.service";
import type { TenantRouteDeps } from "./deps";

/** Publishable-key issuance/rotation (TENANT_MANAGE). Key returned once. */
export function registerTenantPublishableKeyRoutes(routes: Hono, deps: TenantRouteDeps): void {
  const { tenantSettings } = deps;

  routes.post("/:id/publishable-key/rotate", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.TENANT_MANAGE);
    if (denied) return denied;
    if (!tenantSettings) {
      return c.json({ error: "Store keys not supported" }, 503);
    }
    const orgId = await resolveRouteOrgId(tenantSettings, c.req.param("id"));
    if (!orgId) return notFound(c);
    // Rotation is get + generate + upsert — one flow, no second service method.
    const current = await tenantSettings.get(orgId);
    const { id: _id, orgId: _org, ...rest } = current;
    const publishableKey = generatePublishableKey();
    await tenantSettings.upsert(orgId, { ...rest, publishableKey });
    return ok(c, { publishableKey });
  });
}
