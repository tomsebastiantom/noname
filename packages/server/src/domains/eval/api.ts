import { PERMISSIONS } from "@noname/auth";
import { Hono } from "hono";
import { getOrgId } from "../../shared/org";
import { ok } from "../../shared/respond";
import { denyUnless } from "../auth/deny-unless";
import type { CapabilityRegistry } from "../capabilities/registry";
import type { TenantCatalogService } from "../tenant/ports";

/**
 * Machine-only context for the eval service.
 *
 * The eval process cannot import the server's capability registry (boundary rule) and must not guess which
 * capabilities a tenant has. This endpoint exposes exactly what a check needs: the registered capabilities
 * with their declared permission/extension, and the extensions installed for the tenant.
 */
export function createEvalRoutes(deps: {
  capabilities: CapabilityRegistry;
  tenants: Pick<TenantCatalogService, "getManifest">;
}) {
  const routes = new Hono();

  routes.get("/context", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.MACHINES_READ);
    if (denied) return denied;

    const orgId = getOrgId(c);
    const manifest = await deps.tenants.getManifest(orgId);
    const capabilities = deps.capabilities.names().map((name) => {
      const definition = deps.capabilities.definition(name);
      return {
        name,
        permission: definition?.permission ?? null,
        extension: definition?.extension ?? null,
        publicAccess: definition?.publicAccess ?? null,
      };
    });

    return ok(c, {
      capabilities,
      extensions: manifest.extensions ?? [],
    });
  });

  return routes;
}
