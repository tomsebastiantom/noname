import type { TenantAuthConfig } from "../documents/ports";

export type { TenantAuthConfig };

export const DEFAULT_TENANT_AUTH: TenantAuthConfig = {
  providers: [],
  idpIds: {},
  allowPassword: true,
};

const SUPPORTED_PROVIDERS = new Set(["google", "github", "apple"]);

export function normalizeAuthConfig(raw: unknown): TenantAuthConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_TENANT_AUTH };
  }
  const record = raw as Record<string, unknown>;
  const providers = Array.isArray(record.providers)
    ? record.providers.filter(
        (p): p is string => typeof p === "string" && SUPPORTED_PROVIDERS.has(p),
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
  return {
    providers,
    idpIds,
    allowPassword: record.allowPassword !== false,
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
  };
}
