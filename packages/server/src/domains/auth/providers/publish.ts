import {
  AUTH_PROVIDER_CONTENT_TYPE,
  buildGenericOAuthPayload,
  customProviderId,
  parseAuthProviderEntryData,
} from "../../documents/content-types/auth-provider";
import type { DocumentStorage, TenantSettingsService } from "../../documents/ports";
import { mergeAuthConfig, normalizeAuthConfig } from "../../documents/tenant/auth-config";
import { upsertZitadelIdp } from "../adapters/zitadel/management";

/** On publish: push OAuth config to ZITADEL and store the returned IdP id in tenant settings. */
export async function publishAuthProviderSideEffect(
  tenantSettings: TenantSettingsService,
  storage: DocumentStorage,
  orgId: string,
  documentId: string,
): Promise<void> {
  const row = await storage.findDocumentById(documentId);
  if (!row || row.type !== AUTH_PROVIDER_CONTENT_TYPE) return;

  const entry = parseAuthProviderEntryData(row.data);
  const providerId = customProviderId(entry.providerKey);
  const settings = await tenantSettings.get(orgId);
  const current = normalizeAuthConfig(settings.auth);
  const idpIds = { ...current.idpIds };

  if (entry.enabled) {
    const zitadelId = await upsertZitadelIdp(
      orgId,
      "oauth",
      entry.name,
      buildGenericOAuthPayload(entry),
      idpIds[providerId],
    );
    idpIds[providerId] = zitadelId;
  } else {
    delete idpIds[providerId];
  }

  const next = mergeAuthConfig(current, { idpIds });
  await tenantSettings.upsert(orgId, {
    slug: settings.slug,
    locales: settings.locales,
    defaultLocale: settings.defaultLocale,
    seo: settings.seo,
    integrations: settings.integrations,
    auth: next,
  });
}

export function createAuthProviderPublishHandler(deps: {
  storage: DocumentStorage;
  tenantSettings: TenantSettingsService;
}) {
  return async (orgId: string, type: string, id: string): Promise<void> => {
    if (type !== AUTH_PROVIDER_CONTENT_TYPE) return;
    await publishAuthProviderSideEffect(deps.tenantSettings, deps.storage, orgId, id);
  };
}
