import {
  AUTH_PROVIDER_CONTENT_TYPE,
  buildGenericOAuthPayload,
  isBuiltinLoginProvider,
  mergeAuthConfig,
  normalizeAuthConfig,
  parseAuthProviderDisplayData,
  parseAuthProviderEntryData,
  providerIdFromKey,
} from "../../documents/contracts";
import type { DocumentStorage, TenantSettingsService } from "../../documents/ports";
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

  const display = parseAuthProviderDisplayData(row.data);
  if (!display) return;

  // Built-in rows hold enable/label/icon only — credentials go through PUT /auth/config.
  if (isBuiltinLoginProvider(display.providerKey)) return;

  const entry = parseAuthProviderEntryData(row.data);
  const providerId = providerIdFromKey(entry.providerKey);
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
