import type { ContentDocumentService, TenantAuthConfig } from "../../ports";
import {
  AUTH_PROVIDER_CONTENT_TYPE,
  customProviderId,
  isBuiltinLoginProvider,
  parseAuthProviderEntryData,
  parseIconAssetId,
} from "./content";

export interface PublishedCustomAuthProvider {
  providerId: string;
  name: string;
  iconDocumentId: string | null;
  enabled: boolean;
}

/** Published auth_provider documents — source of truth for custom login providers. */
export async function listPublishedCustomAuthProviders(
  content: Pick<ContentDocumentService, "findByType">,
  orgId: string,
): Promise<PublishedCustomAuthProvider[]> {
  const rows = await content.findByType(orgId, AUTH_PROVIDER_CONTENT_TYPE);
  const providers: PublishedCustomAuthProvider[] = [];

  for (const row of rows) {
    if (row.status !== "published") continue;
    try {
      const entry = parseAuthProviderEntryData(row.data);
      providers.push({
        providerId: customProviderId(entry.providerKey),
        name: entry.name,
        iconDocumentId: parseIconAssetId(row.data),
        enabled: entry.enabled,
      });
    } catch {
      // Skip invalid rows until the merchant fixes them.
    }
  }

  return providers;
}

/** Built-in providers from settings plus enabled custom providers with ZITADEL IdP ids. */
export function resolveLoginProviders(
  auth: TenantAuthConfig,
  customProviders: PublishedCustomAuthProvider[],
): string[] {
  const builtIn = auth.providers.filter(
    (provider) => isBuiltinLoginProvider(provider) && Boolean(auth.idpIds[provider]?.trim()),
  );

  const custom = customProviders
    .filter((provider) => provider.enabled && Boolean(auth.idpIds[provider.providerId]?.trim()))
    .map((provider) => provider.providerId);

  return [...builtIn, ...custom];
}
