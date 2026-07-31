import { apiFetch, apiFetchVoid } from "../lib/api";
import { requireStoreSlug } from "./org";

export type AuthProvider = "google" | "github" | "apple";

export const ALL_AUTH_PROVIDERS: AuthProvider[] = ["google", "github", "apple"];

export interface AuthSettingsState {
  providers: AuthProvider[];
  allowPassword: boolean;
  allowSignUp: boolean;
  allowPasswordReset: boolean;
  requireMfaForAdmin: boolean;
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

export async function loadAuthSettings(): Promise<AuthSettingsState> {
  const storeSlug = requireStoreSlug();

  const [configBody, settingsBody] = await Promise.all([
    apiFetch<{
      data?: {
        providers?: string[];
        allowPassword?: boolean;
        allowSignUp?: boolean;
        allowPasswordReset?: boolean;
        requireMfaForAdmin?: boolean;
      };
    }>(`/api/tenants/${storeSlug}/auth/config`),
    apiFetch<{ data?: { auth?: { idpIds?: Record<string, string>; providers?: string[] } } }>(
      "/api/documents/tenant_settings/default",
    ).catch(() => ({ data: undefined } as { data?: undefined })),
  ]);

  let providers = (configBody.data?.providers ?? []).filter((p): p is AuthProvider =>
    ALL_AUTH_PROVIDERS.includes(p as AuthProvider),
  );

  let idpIds: Record<string, string> = {};

  if (settingsBody.data?.auth) {
    idpIds = settingsBody.data.auth.idpIds ?? {};
    if (providers.length === 0 && settingsBody.data.auth.providers) {
      providers = settingsBody.data.auth.providers.filter((p): p is AuthProvider =>
        ALL_AUTH_PROVIDERS.includes(p as AuthProvider),
      );
    }
  }

  return {
    providers,
    allowPassword: configBody.data?.allowPassword !== false,
    allowSignUp: configBody.data?.allowSignUp === true,
    allowPasswordReset: configBody.data?.allowPasswordReset !== false,
    requireMfaForAdmin: configBody.data?.requireMfaForAdmin === true,
    googleConfigured: idpConfigured(idpIds, "google"),
    githubConfigured: idpConfigured(idpIds, "github"),
    appleConfigured: idpConfigured(idpIds, "apple"),
  };
}

export async function saveAuthConfig(input: {
  providers: AuthProvider[];
  allowPassword: boolean;
  allowSignUp?: boolean;
  allowPasswordReset?: boolean;
  requireMfaForAdmin?: boolean;
  googleOAuth?: { clientId: string; clientSecret: string };
  githubOAuth?: { clientId: string; clientSecret: string };
  appleOAuth?: { clientId: string; teamId: string; keyId: string; privateKey: string };
}): Promise<AuthProvider[]> {
  const storeSlug = requireStoreSlug();

  const body = await apiFetch<{ data?: { providers?: string[] } }>(
    `/api/tenants/${storeSlug}/auth/config`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );

  return (body.data?.providers ?? []).filter((p): p is AuthProvider =>
    ALL_AUTH_PROVIDERS.includes(p as AuthProvider),
  );
}
