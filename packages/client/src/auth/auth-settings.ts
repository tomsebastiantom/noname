import { requireStoreSlug } from "./org";
import { apiHeaders } from "./session";

export type AuthProvider = "google" | "github" | "apple";

export const ALL_AUTH_PROVIDERS: AuthProvider[] = ["google", "github", "apple"];

export interface AuthSettingsState {
  providers: AuthProvider[];
  allowPassword: boolean;
  googleConfigured: boolean;
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
    data?: { providers?: string[]; allowPassword?: boolean };
  };

  let providers = (configBody.data?.providers ?? []).filter((p): p is AuthProvider =>
    ALL_AUTH_PROVIDERS.includes(p as AuthProvider),
  );

  let googleConfigured = providers.includes("google");

  if (settingsRes.ok) {
    const settingsBody = (await settingsRes.json()) as {
      data?: { auth?: { idpIds?: Record<string, string>; providers?: string[] } };
    };
    googleConfigured = Boolean(settingsBody.data?.auth?.idpIds?.google?.trim());
    if (providers.length === 0 && settingsBody.data?.auth?.providers) {
      providers = settingsBody.data.auth.providers.filter((p): p is AuthProvider =>
        ALL_AUTH_PROVIDERS.includes(p as AuthProvider),
      );
    }
  }

  return {
    providers,
    allowPassword: configBody.data?.allowPassword !== false,
    googleConfigured,
  };
}

export async function saveAuthConfig(input: {
  providers: AuthProvider[];
  allowPassword: boolean;
  googleOAuth?: { clientId: string; clientSecret: string };
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
