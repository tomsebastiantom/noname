import { documentIdFromRef } from "../documents/refs";

export const AUTH_PROVIDER_CONTENT_TYPE = "auth_provider";

export interface AuthProviderEntryData {
  name: string;
  providerKey: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userEndpoint: string;
  scopes: string[];
  enabled: boolean;
}

const PROVIDER_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function customProviderId(providerKey: string): string {
  return `custom:${providerKey}`;
}

const BUILTIN_PROVIDER_PATTERN = /^(google|github|apple)$/;

export function isCustomProviderId(provider: string): boolean {
  return provider.startsWith("custom:");
}

export function isSupportedLoginProvider(provider: string): boolean {
  return BUILTIN_PROVIDER_PATTERN.test(provider) || isCustomProviderId(provider);
}

export function parseAuthProviderEntryData(data: Record<string, unknown>): AuthProviderEntryData {
  const providerKey = String(data.provider_key ?? "")
    .trim()
    .toLowerCase();
  if (!providerKey || !PROVIDER_KEY_PATTERN.test(providerKey)) {
    throw new Error("provider_key must be lowercase letters, numbers, and hyphens");
  }

  const name = String(data.name ?? "").trim();
  const clientId = String(data.client_id ?? "").trim();
  const clientSecret = String(data.client_secret ?? "").trim();
  const authorizationEndpoint = String(data.authorization_endpoint ?? "").trim();
  const tokenEndpoint = String(data.token_endpoint ?? "").trim();
  const userEndpoint = String(data.user_endpoint ?? "").trim();

  if (!name) throw new Error("name is required");
  if (!clientId || !clientSecret) throw new Error("client_id and client_secret are required");
  if (!authorizationEndpoint || !tokenEndpoint || !userEndpoint) {
    throw new Error("authorization_endpoint, token_endpoint, and user_endpoint are required");
  }

  const scopesRaw = String(data.scopes ?? "openid email profile").trim();
  const scopes = scopesRaw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const enabled = data.enabled === undefined ? true : Boolean(data.enabled);

  return {
    name,
    providerKey,
    clientId,
    clientSecret,
    authorizationEndpoint,
    tokenEndpoint,
    userEndpoint,
    scopes: scopes.length > 0 ? scopes : ["openid", "email", "profile"],
    enabled,
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
