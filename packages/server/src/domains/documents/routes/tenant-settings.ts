import { PERMISSIONS } from "@noname/auth";
import type { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { ok } from "../../../shared/respond";
import { denyUnless } from "../../auth/deny-unless";
import type { TenantAuthConfig } from "../ports";
import { mergeAuthConfig, normalizeAuthConfig } from "../tenant/auth-config";
import type { DocumentsRouteDeps } from "./deps";

export function registerTenantSettingsRoutes(routes: Hono, deps: DocumentsRouteDeps): void {
  const { tenantSettings } = deps.service;

  routes.get("/tenant_settings/default", async (c) => {
    const orgId = getOrgId(c);
    return ok(c, await tenantSettings.get(orgId));
  });

  routes.put("/tenant_settings/default", async (c) => {
    const denied = await denyUnless(c, PERMISSIONS.AUTH_MANAGE);
    if (denied) return denied;
    const orgId = getOrgId(c);
    const body = await c.req.json<{
      slug?: string | null;
      locales?: string[];
      defaultLocale?: string;
      seo?: Record<string, unknown>;
      integrations?: Record<string, string | null>;
      auth?: {
        providers?: string[];
        idpIds?: Record<string, string>;
        allowPassword?: boolean;
        providerLabels?: Record<string, string>;
        providerIconAssets?: Record<string, { documentId: string }>;
      };
    }>();
    const current = await tenantSettings.get(orgId);
    const upserted = await tenantSettings.upsert(orgId, {
      slug: "slug" in body ? body.slug! : current.slug,
      locales: body.locales ?? current.locales,
      defaultLocale: body.defaultLocale ?? current.defaultLocale,
      seo: (body.seo ?? current.seo) as never,
      integrations: (body.integrations ?? current.integrations) as never,
      auth: body.auth
        ? mergeAuthConfig(normalizeAuthConfig(current.auth), body.auth as Partial<TenantAuthConfig>)
        : current.auth,
    });
    return ok(c, upserted);
  });
}
