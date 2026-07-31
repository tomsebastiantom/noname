import type { ContentDocumentService, TenantAuthConfig } from "../../ports";
import { isPublished } from "../../shared/document-status";
import {
  AUTH_PROVIDER_CONTENT_TYPE,
  isBuiltinLoginProvider,
  parseAuthProviderDisplayData,
  parseAuthProviderEntryData,
  parseIconAssetId,
  providerIdFromKey,
} from "./content";

export interface PublishedAuthProvider {
  providerId: string;
  name: string;
  iconDocumentId: string | null;
  enabled: boolean;
}

/** Published auth_provider documents — enable, label, and icon for all login providers. */
export async function listPublishedAuthProviders(
  content: Pick<ContentDocumentService, "findByType">,
  orgId: string,
): Promise<PublishedAuthProvider[]> {
  const rows = await content.findByType(orgId, AUTH_PROVIDER_CONTENT_TYPE);
  const providers: PublishedAuthProvider[] = [];

  for (const row of rows) {
    if (!isPublished(row)) continue;

    const display = parseAuthProviderDisplayData(row.data);
    if (!display) continue;

    if (!isBuiltinLoginProvider(display.providerKey)) {
      try {
        parseAuthProviderEntryData(row.data);
      } catch {
        continue;
      }
    }

    providers.push({
      providerId: providerIdFromKey(display.providerKey),
      name: display.name,
      iconDocumentId: parseIconAssetId(row.data),
      enabled: display.enabled,
    });
  }

  return providers;
}

/** Enabled published providers that also have a ZITADEL IdP id for this org. */
export function resolveLoginProviders(
  auth: TenantAuthConfig,
  publishedProviders: PublishedAuthProvider[],
): string[] {
  return publishedProviders
    .filter((provider) => provider.enabled && Boolean(auth.idpIds[provider.providerId]?.trim()))
    .map((provider) => provider.providerId);
}
