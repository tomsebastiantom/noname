import type { TenantSettingsService } from "../documents/ports";
import {
  DEFAULT_TENANT_AUTH,
  enabledProviders,
  idpIdForProvider,
  mergeAuthConfig,
  normalizeAuthConfig,
} from "./auth-config";
import type { AuthConfig, AuthConfigUpdate, AuthService } from "./ports";
import {
  buildOAuthAuthorizeUrl,
  exchangeAuthorizationCode,
  loginWithCredentials,
} from "./zitadel-client";

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
      const next = mergeAuthConfig(current, {
        providers: patch.providers,
        allowPassword: patch.allowPassword,
        idpIds: patch.idpIds,
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

export { DEFAULT_TENANT_AUTH, enabledProviders, normalizeAuthConfig };
