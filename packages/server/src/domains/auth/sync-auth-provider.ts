import type {
  AssetDocumentService,
  DocumentStorage,
  TenantSettingsService,
} from "../documents/ports";
import { mergeAuthConfig, normalizeAuthConfig } from "./auth-config";
import {
  AUTH_PROVIDER_CONTENT_TYPE,
  buildGenericOAuthPayload,
  customProviderId,
  parseAuthProviderEntryData,
  parseIconAssetId,
} from "./auth-provider-content";
import { upsertZitadelIdp } from "./zitadel-management";

function isBuiltinProvider(provider: string): boolean {
  return provider === "google" || provider === "github" || provider === "apple";
}

async function rebuildCustomProviders(
  tenantSettings: TenantSettingsService,
  storage: DocumentStorage,
  orgId: string,
  idpIdsFromSync: Record<string, string>,
): Promise<void> {
  const settings = await tenantSettings.get(orgId);
  const current = normalizeAuthConfig(settings.auth);

  const builtInProviders = current.providers.filter(isBuiltinProvider);
  const builtInIdpIds = Object.fromEntries(
    Object.entries(current.idpIds).filter(([key]) => isBuiltinProvider(key)),
  );
  const builtInIconAssets = Object.fromEntries(
    Object.entries(current.providerIconAssets ?? {}).filter(([key]) => isBuiltinProvider(key)),
  );

  const rows = await storage.listDocuments(orgId, {
    type: AUTH_PROVIDER_CONTENT_TYPE,
    status: "published",
  });

  const customProviders: string[] = [];
  const customIdpIds: Record<string, string> = { ...idpIdsFromSync };
  const providerLabels: Record<string, string> = {};
  const providerIconAssets: Record<string, { documentId: string }> = {};

  for (const row of rows) {
    try {
      const entry = parseAuthProviderEntryData(row.data);
      if (!entry.enabled) continue;

      const providerId = customProviderId(entry.providerKey);
      customProviders.push(providerId);
      providerLabels[providerId] = entry.name;

      if (!customIdpIds[providerId]) {
        const existing = current.idpIds[providerId];
        if (existing) customIdpIds[providerId] = existing;
      }

      const iconAssetId = parseIconAssetId(row.data);
      if (iconAssetId) {
        providerIconAssets[providerId] = { documentId: iconAssetId };
      }
    } catch {
      // Skip invalid published rows until merchant fixes them.
    }
  }

  const next = mergeAuthConfig(current, {
    providers: [...builtInProviders, ...customProviders],
    idpIds: { ...builtInIdpIds, ...customIdpIds },
    providerLabels: {
      ...Object.fromEntries(
        Object.entries(current.providerLabels ?? {}).filter(([key]) => isBuiltinProvider(key)),
      ),
      ...providerLabels,
    },
    providerIconAssets: {
      ...builtInIconAssets,
      ...providerIconAssets,
    },
  });

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
  assets: AssetDocumentService;
}) {
  return async (orgId: string, type: string, id: string): Promise<void> => {
    if (type !== AUTH_PROVIDER_CONTENT_TYPE) return;

    const row = await deps.storage.findDocumentById(id);
    if (!row || row.type !== AUTH_PROVIDER_CONTENT_TYPE) return;

    const entry = parseAuthProviderEntryData(row.data);
    const providerId = customProviderId(entry.providerKey);
    const idpIdsFromSync: Record<string, string> = {};

    if (entry.enabled) {
      const existingIdpId = normalizeAuthConfig((await deps.tenantSettings.get(orgId)).auth).idpIds[
        providerId
      ];

      const zitadelId = await upsertZitadelIdp(
        orgId,
        "oauth",
        entry.name,
        buildGenericOAuthPayload(entry),
        existingIdpId,
      );
      idpIdsFromSync[providerId] = zitadelId;
    }

    await rebuildCustomProviders(deps.tenantSettings, deps.storage, orgId, idpIdsFromSync);
  };
}
