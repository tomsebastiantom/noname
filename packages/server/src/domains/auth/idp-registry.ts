import type { TenantAuthConfig } from "../documents/ports";
import type { AuthConfigUpdate } from "./ports";

export type IdpProviderId = "google" | "github" | "apple";

export interface ClientSecretCredentials {
  clientId: string;
  clientSecret: string;
}

export interface AppleCredentials {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
}

type IdpCredentials = ClientSecretCredentials | AppleCredentials;

interface IdpProviderDefinition {
  id: IdpProviderId;
  label: string;
  /** ZITADEL Management API path segment — typed templates, not generic /idps/oauth. */
  zitadelPath: string;
  scopes: string[];
  patchField: keyof Pick<AuthConfigUpdate, "googleOAuth" | "githubOAuth" | "appleOAuth">;
  missingCredentialsError: string;
  buildPayload: (credentials: IdpCredentials) => Record<string, unknown>;
}

/** Built-in ZITADEL IdP templates. Custom providers can use /idps/oauth later. */
export const IDP_PROVIDER_REGISTRY: Record<IdpProviderId, IdpProviderDefinition> = {
  google: {
    id: "google",
    label: "Google",
    zitadelPath: "google",
    scopes: ["openid", "profile", "email"],
    patchField: "googleOAuth",
    missingCredentialsError:
      "Google OAuth client ID and secret are required to enable Google sign-in",
    buildPayload: (credentials) => {
      const oauth = credentials as ClientSecretCredentials;
      return {
        name: "Google",
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret,
        scopes: ["openid", "profile", "email"],
      };
    },
  },
  github: {
    id: "github",
    label: "GitHub",
    zitadelPath: "github",
    scopes: ["read:user", "user:email"],
    patchField: "githubOAuth",
    missingCredentialsError:
      "GitHub OAuth client ID and secret are required to enable GitHub sign-in",
    buildPayload: (credentials) => {
      const oauth = credentials as ClientSecretCredentials;
      return {
        name: "GitHub",
        clientId: oauth.clientId,
        clientSecret: oauth.clientSecret,
        scopes: ["read:user", "user:email"],
      };
    },
  },
  apple: {
    id: "apple",
    label: "Apple",
    zitadelPath: "apple",
    scopes: ["openid", "email", "name"],
    patchField: "appleOAuth",
    missingCredentialsError:
      "Apple Services ID, Team ID, Key ID, and private key are required to enable Apple sign-in",
    buildPayload: (credentials) => {
      const apple = credentials as AppleCredentials;
      return {
        name: "Apple",
        clientId: apple.clientId,
        teamId: apple.teamId,
        keyId: apple.keyId,
        privateKey: apple.privateKey,
        scopes: ["openid", "email", "name"],
      };
    },
  },
};

export const IDP_PROVIDER_IDS = Object.keys(IDP_PROVIDER_REGISTRY) as IdpProviderId[];

/** Login button copy returned by GET /auth/config — merges stored labels with registry defaults. */
export function publicProviderLabels(
  providers: string[],
  storedLabels: Record<string, string> = {},
): Record<string, string> {
  const labels: Record<string, string> = {};

  for (const providerId of providers) {
    const stored = storedLabels[providerId]?.trim();
    if (stored) {
      labels[providerId] = stored.startsWith("Continue with ") ? stored : `Continue with ${stored}`;
      continue;
    }

    const builtIn = IDP_PROVIDER_REGISTRY[providerId as IdpProviderId];
    if (builtIn) {
      labels[providerId] = `Continue with ${builtIn.label}`;
      continue;
    }

    if (providerId.startsWith("custom:")) {
      labels[providerId] = `Continue with ${providerId.slice("custom:".length)}`;
    }
  }

  return labels;
}

export function credentialsFromPatch(
  providerId: IdpProviderId,
  patch: AuthConfigUpdate,
): IdpCredentials | undefined {
  return patch[IDP_PROVIDER_REGISTRY[providerId].patchField];
}

export function resolveIdpUpdate(
  providerId: IdpProviderId,
  current: TenantAuthConfig,
  patch: AuthConfigUpdate,
): {
  required: boolean;
  existingIdpId?: string;
  credentials?: IdpCredentials;
} {
  const providers = patch.providers ?? current.providers;
  if (!providers.includes(providerId)) {
    return { required: false };
  }

  const mergedIdpIds = patch.idpIds ? { ...current.idpIds, ...patch.idpIds } : current.idpIds;
  const existingIdpId = mergedIdpIds[providerId]?.trim() || undefined;
  const credentials = credentialsFromPatch(providerId, patch);

  if (credentials) {
    return { required: true, existingIdpId, credentials };
  }

  if (existingIdpId) {
    return { required: false, existingIdpId };
  }

  return { required: true };
}
