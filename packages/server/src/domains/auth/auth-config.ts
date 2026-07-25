import type { TenantAuthConfig } from "../documents/ports";
import { isSupportedLoginProvider } from "./auth-provider-content";

export type { TenantAuthConfig };

export const DEFAULT_TENANT_AUTH: TenantAuthConfig = {
  providers: [],
  idpIds: {},
  allowPassword: true,
  providerLabels: {},
  providerIconAssets: {},
};

function parseIconAssetRef(value: unknown): { assetId: string } | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const assetId = (value as { assetId?: unknown }).assetId;
  if (typeof assetId !== "string" || assetId.trim() === "") return null;
  return { assetId: assetId.trim() };
}

export function normalizeAuthConfig(raw: unknown): TenantAuthConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_TENANT_AUTH };
  }
  const record = raw as Record<string, unknown>;
  const providers = Array.isArray(record.providers)
    ? record.providers.filter(
        (p): p is string => typeof p === "string" && isSupportedLoginProvider(p),
      )
    : [];
  const idpIds: Record<string, string> = {};
  if (record.idpIds && typeof record.idpIds === "object" && !Array.isArray(record.idpIds)) {
    for (const [key, value] of Object.entries(record.idpIds as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim() !== "") {
        idpIds[key] = value.trim();
      }
    }
  }
  const providerLabels: Record<string, string> = {};
  if (
    record.providerLabels &&
    typeof record.providerLabels === "object" &&
    !Array.isArray(record.providerLabels)
  ) {
    for (const [key, value] of Object.entries(record.providerLabels as Record<string, unknown>)) {
      if (typeof value === "string" && value.trim() !== "") {
        providerLabels[key] = value.trim();
      }
    }
  }
  const providerIconAssets: Record<string, { assetId: string }> = {};
  if (
    record.providerIconAssets &&
    typeof record.providerIconAssets === "object" &&
    !Array.isArray(record.providerIconAssets)
  ) {
    for (const [key, value] of Object.entries(record.providerIconAssets as Record<string, unknown>)) {
      const ref = parseIconAssetRef(value);
      if (ref) providerIconAssets[key] = ref;
    }
  }
  return {
    providers,
    idpIds,
    allowPassword: record.allowPassword !== false,
    providerLabels,
    providerIconAssets,
  };
}

/** Providers that are enabled AND have a ZITADEL IdP id configured for this org. */
export function enabledProviders(auth: TenantAuthConfig): string[] {
  return auth.providers.filter((provider) => {
    const id = auth.idpIds[provider]?.trim();
    return Boolean(id);
  });
}

export function idpIdForProvider(auth: TenantAuthConfig, provider: string): string | null {
  const id = auth.idpIds[provider]?.trim();
  return id || null;
}

export function mergeAuthConfig(
  current: TenantAuthConfig,
  patch: Partial<TenantAuthConfig>,
): TenantAuthConfig {
  return {
    providers: patch.providers ?? current.providers,
    allowPassword: patch.allowPassword ?? current.allowPassword,
    idpIds: patch.idpIds !== undefined ? { ...patch.idpIds } : { ...current.idpIds },
    providerLabels:
      patch.providerLabels !== undefined
        ? { ...patch.providerLabels }
        : { ...(current.providerLabels ?? {}) },
    providerIconAssets:
      patch.providerIconAssets !== undefined
        ? { ...patch.providerIconAssets }
        : { ...(current.providerIconAssets ?? {}) },
  };
}
