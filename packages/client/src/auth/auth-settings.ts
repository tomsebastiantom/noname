import { apiFetch, apiFetchVoid } from "../lib/api";
import { requireStoreSlug } from "./org";

export type AuthProvider = "google" | "github" | "apple";

export const ALL_AUTH_PROVIDERS: AuthProvider[] = ["google", "github", "apple"];

export interface AuthProviderEntryState {
  providerKey: AuthProvider;
  name: string;
  enabled: boolean;
}

export interface AuthSettingsState {
  allowPassword: boolean;
  allowSignUp: boolean;
  allowPasswordReset: boolean;
  requireMfaForAdmin: boolean;
  authProviders: AuthProviderEntryState[];
  googleConfigured: boolean;
  githubConfigured: boolean;
  appleConfigured: boolean;
}

function idpConfigured(
  idpIds: Record<string, string> | undefined,
  provider: AuthProvider,
): boolean {
  return Boolean(idpIds?.[provider]?.trim());
}

export async function loadAuthProviderEntries(): Promise<AuthProviderEntryState[]> {
  const body = await apiFetch<{ data?: Array<{ data?: Record<string, unknown> }> }>(
    "/api/documents/auth_provider",
  ).catch(() => ({ data: undefined }));

  const entries: AuthProviderEntryState[] = [];
  for (const row of body.data ?? []) {
    const providerKey = String(row.data?.provider_key ?? "")
      .trim()
      .toLowerCase();
    if (!ALL_AUTH_PROVIDERS.includes(providerKey as AuthProvider)) continue;

    entries.push({
      providerKey: providerKey as AuthProvider,
      name: String(row.data?.name ?? providerKey).trim(),
      enabled: row.data?.enabled !== false,
    });
  }

  return entries;
}

export async function loadAuthSettings(): Promise<AuthSettingsState> {
  const storeSlug = requireStoreSlug();

  const [configBody, settingsBody, authProviders] = await Promise.all([
    apiFetch<{
      data?: {
        allowPassword?: boolean;
        allowSignUp?: boolean;
        allowPasswordReset?: boolean;
        requireMfaForAdmin?: boolean;
      };
    }>(`/api/tenants/${storeSlug}/auth/config`),
    apiFetch<{ data?: { auth?: { idpIds?: Record<string, string> } } }>(
      "/api/documents/tenant_settings/default",
    ).catch(() => ({ data: undefined }) as { data?: undefined }),
    loadAuthProviderEntries(),
  ]);

  const idpIds = settingsBody.data?.auth?.idpIds ?? {};

  return {
    allowPassword: configBody.data?.allowPassword !== false,
    allowSignUp: configBody.data?.allowSignUp === true,
    allowPasswordReset: configBody.data?.allowPasswordReset !== false,
    requireMfaForAdmin: configBody.data?.requireMfaForAdmin === true,
    authProviders,
    googleConfigured: idpConfigured(idpIds, "google"),
    githubConfigured: idpConfigured(idpIds, "github"),
    appleConfigured: idpConfigured(idpIds, "apple"),
  };
}

export async function saveAuthConfig(input: {
  allowPassword: boolean;
  allowSignUp?: boolean;
  allowPasswordReset?: boolean;
  requireMfaForAdmin?: boolean;
  googleOAuth?: { clientId: string; clientSecret: string };
  githubOAuth?: { clientId: string; clientSecret: string };
  appleOAuth?: { clientId: string; teamId: string; keyId: string; privateKey: string };
}): Promise<void> {
  const storeSlug = requireStoreSlug();

  await apiFetchVoid(`/api/tenants/${storeSlug}/auth/config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}
