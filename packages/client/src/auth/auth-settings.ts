import { requireStoreSlug } from "./org";
import { apiHeaders } from "./session";

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
  const headers = apiHeaders();

  const [configRes, settingsRes] = await Promise.all([
    fetch(`/api/tenants/${storeSlug}/auth/config`, { headers }),
    fetch("/api/documents/tenant_settings/default", { headers }),
  ]);

  if (!configRes.ok) {
    throw new Error(`Failed to load auth config (${configRes.status})`);
  }

  const configBody = (await configRes.json()) as {
    data?: {
      providers?: string[];
      allowPassword?: boolean;
      allowSignUp?: boolean;
      allowPasswordReset?: boolean;
      requireMfaForAdmin?: boolean;
    };
  };

  let providers = (configBody.data?.providers ?? []).filter((p): p is AuthProvider =>
    ALL_AUTH_PROVIDERS.includes(p as AuthProvider),
  );

  let idpIds: Record<string, string> = {};

  if (settingsRes.ok) {
    const settingsBody = (await settingsRes.json()) as {
      data?: { auth?: { idpIds?: Record<string, string>; providers?: string[] } };
    };
    idpIds = settingsBody.data?.auth?.idpIds ?? {};
    if (providers.length === 0 && settingsBody.data?.auth?.providers) {
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

  const res = await fetch(`/api/tenants/${storeSlug}/auth/config`, {
    method: "PUT",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Save failed (${res.status})`);
  }

  const body = (await res.json()) as { data?: { providers?: string[] } };
  return (body.data?.providers ?? []).filter((p): p is AuthProvider =>
    ALL_AUTH_PROVIDERS.includes(p as AuthProvider),
  );
}
