import type { TenantSettingsService } from "../documents/ports";
import {
  enabledProviders,
  idpIdForProvider,
  mergeAuthConfig,
  normalizeAuthConfig,
} from "./auth-config";
import type { AuthConfig, AuthService } from "./ports";
import { resolveGoogleIdpId } from "./resolve-google-idp";
import {
  buildOAuthAuthorizeUrl,
  exchangeAuthorizationCode,
  loginWithCredentials,
} from "./zitadel-client";
import { upsertGoogleIdp } from "./zitadel-management";

export function createAuthService(deps: { tenantSettings: TenantSettingsService }): AuthService {
  const { tenantSettings } = deps;

  async function loadAuth(orgId: string) {
    const settings = await tenantSettings.get(orgId);
    return normalizeAuthConfig(settings.auth);
  }

  async function publicConfig(orgId: string): Promise<AuthConfig> {
    const auth = await loadAuth(orgId);
    return {
      providers: enabledProviders(auth),
      allowPassword: auth.allowPassword,
    };
  }

  return {
    login: (input) => loginWithCredentials(input),

    getConfig: publicConfig,

    async updateConfig(orgId, patch) {
      const settings = await tenantSettings.get(orgId);
      const current = normalizeAuthConfig(settings.auth);
      const google = resolveGoogleIdpId(current, patch);

      if (google.required && !google.googleOAuth && !google.existingIdpId) {
        throw new Error("Google OAuth client ID and secret are required to enable Google sign-in");
      }

      let idpIds = patch.idpIds ? { ...current.idpIds, ...patch.idpIds } : { ...current.idpIds };
      const providers = patch.providers ?? current.providers;

      for (const provider of Object.keys(idpIds)) {
        if (!providers.includes(provider)) {
          delete idpIds[provider];
        }
      }

      if (google.googleOAuth) {
        const id = await upsertGoogleIdp(orgId, {
          clientId: google.googleOAuth.clientId,
          clientSecret: google.googleOAuth.clientSecret,
          existingIdpId: google.existingIdpId,
        });
        idpIds = { ...idpIds, google: id };
      }

      const next = mergeAuthConfig(current, {
        providers,
        allowPassword: patch.allowPassword,
        idpIds,
      });

      await tenantSettings.upsert(orgId, {
        locales: settings.locales,
        defaultLocale: settings.defaultLocale,
        seo: settings.seo,
        integrations: settings.integrations,
        auth: next,
      });

      return publicConfig(orgId);
    },

    async startIdpLogin(input) {
      const auth = await loadAuth(input.orgId);
      const idpId = idpIdForProvider(auth, input.provider);
      if (!idpId) {
        throw new Error(`Identity provider "${input.provider}" is not configured for this org`);
      }

      const authorizeUrl = await buildOAuthAuthorizeUrl({
        orgId: input.orgId,
        clientId: input.clientId,
        redirectUri: input.redirectUri,
        codeChallenge: input.codeChallenge,
        idpId,
      });

      return { authorizeUrl };
    },

    exchangeOAuthCallback: (input) => exchangeAuthorizationCode(input),
  };
}

export { DEFAULT_TENANT_AUTH, enabledProviders, normalizeAuthConfig } from "./auth-config";
