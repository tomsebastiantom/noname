import { coerceScalarString } from "@noname/shared";
import { documentIdFromRef } from "../../refs";

export const AUTH_PROVIDER_CONTENT_TYPE = "auth_provider";

export interface AuthProviderDisplayData {
  name: string;
  providerKey: string;
  enabled: boolean;
}

export interface AuthProviderEntryData extends AuthProviderDisplayData {
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userEndpoint: string;
  scopes: string[];
}

const PROVIDER_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const BUILTIN_PROVIDER_PATTERN = /^(google|github|apple)$/;

export function customProviderId(providerKey: string): string {
  return `custom:${providerKey}`;
}

export function providerIdFromKey(providerKey: string): string {
  return isBuiltinLoginProvider(providerKey) ? providerKey : customProviderId(providerKey);
}

export function isCustomProviderId(provider: string): boolean {
  return provider.startsWith("custom:");
}

export function isBuiltinLoginProvider(provider: string): boolean {
  return BUILTIN_PROVIDER_PATTERN.test(provider);
}

export function isSupportedLoginProvider(provider: string): boolean {
  return isBuiltinLoginProvider(provider) || isCustomProviderId(provider);
}

export function parseAuthProviderDisplayData(
  data: Record<string, unknown>,
): AuthProviderDisplayData | null {
  const providerKey = coerceScalarString(data.provider_key).trim().toLowerCase();
  if (!providerKey || !PROVIDER_KEY_PATTERN.test(providerKey)) {
    return null;
  }

  const name = coerceScalarString(data.name).trim();
  if (!name) return null;

  const enabled = Boolean(data.enabled ?? true);

  return { name, providerKey, enabled };
}

/** Full OAuth entry — required credential fields for custom providers only. */
export function parseAuthProviderEntryData(data: Record<string, unknown>): AuthProviderEntryData {
  const display = parseAuthProviderDisplayData(data);
  if (!display) {
    throw new Error("provider_key must be lowercase letters, numbers, and hyphens");
  }

  const clientId = coerceScalarString(data.client_id).trim();
  const clientSecret = coerceScalarString(data.client_secret).trim();
  const authorizationEndpoint = coerceScalarString(data.authorization_endpoint).trim();
  const tokenEndpoint = coerceScalarString(data.token_endpoint).trim();
  const userEndpoint = coerceScalarString(data.user_endpoint).trim();

  if (isBuiltinLoginProvider(display.providerKey)) {
    throw new Error("Built-in providers must not include OAuth credentials in CMS entries");
  }

  if (!clientId || !clientSecret) throw new Error("client_id and client_secret are required");
  if (!authorizationEndpoint || !tokenEndpoint || !userEndpoint) {
    throw new Error("authorization_endpoint, token_endpoint, and user_endpoint are required");
  }

  const scopesRaw = coerceScalarString(data.scopes, "openid email profile").trim();
  const scopes = scopesRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ...display,
    clientId,
    clientSecret,
    authorizationEndpoint,
    tokenEndpoint,
    userEndpoint,
    scopes: scopes.length > 0 ? scopes : ["openid", "email", "profile"],
  };
}

export function parseIconAssetId(data: Record<string, unknown>): string | null {
  return documentIdFromRef(data.icon);
}

export function buildGenericOAuthPayload(entry: AuthProviderEntryData): Record<string, unknown> {
  return {
    name: entry.name,
    clientId: entry.clientId,
    clientSecret: entry.clientSecret,
    authorizationEndpoint: entry.authorizationEndpoint,
    tokenEndpoint: entry.tokenEndpoint,
    userEndpoint: entry.userEndpoint,
    scopes: entry.scopes,
    idAttribute: "sub",
    usePkce: true,
  };
}
