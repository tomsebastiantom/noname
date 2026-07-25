import type { AssetDocumentService, TenantSettingsService } from "../documents/ports";
import { resolveProviderIconUrls } from "./asset-url";
import {
  enabledProviders,
  idpIdForProvider,
  mergeAuthConfig,
  normalizeAuthConfig,
} from "./auth-config";
import {
  IDP_PROVIDER_IDS,
  IDP_PROVIDER_REGISTRY,
  publicProviderLabels,
  resolveIdpUpdate,
} from "./idp-registry";
import type { AuthConfig, AuthService } from "./ports";
import {
  buildOAuthAuthorizeUrl,
  exchangeAuthorizationCode,
  loginWithCredentials,
} from "./zitadel-client";
import { upsertZitadelIdp } from "./zitadel-management";

export function createAuthService(deps: {
  tenantSettings: TenantSettingsService;
  assets: AssetDocumentService;
}): AuthService {
  const { tenantSettings, assets } = deps;

  async function loadAuth(orgId: string) {
    const settings = await tenantSettings.get(orgId);
    return normalizeAuthConfig(settings.auth);
  }

  async function publicConfig(orgId: string): Promise<AuthConfig> {
    const auth = await loadAuth(orgId);
    const providers = enabledProviders(auth);
    return {
      providers,
      allowPassword: auth.allowPassword,
      providerLabels: publicProviderLabels(providers, auth.providerLabels ?? {}),
      providerIcons: await resolveProviderIconUrls(
        orgId,
        providers,
        auth.providerIconAssets ?? {},
        assets,
      ),
    };
  }

  return {
    login: (input) => loginWithCredentials(input),

    getConfig: publicConfig,

    async updateConfig(orgId, patch) {
      const settings = await tenantSettings.get(orgId);
      const current = normalizeAuthConfig(settings.auth);
      let idpIds = patch.idpIds ? { ...current.idpIds, ...patch.idpIds } : { ...current.idpIds };
      const providers = patch.providers ?? current.providers;

      for (const providerId of IDP_PROVIDER_IDS) {
        const definition = IDP_PROVIDER_REGISTRY[providerId];
        const resolved = resolveIdpUpdate(providerId, current, patch);

        if (resolved.required && !resolved.credentials && !resolved.existingIdpId) {
          throw new Error(definition.missingCredentialsError);
        }

        if (resolved.credentials) {
          const id = await upsertZitadelIdp(
            orgId,
            definition.zitadelPath,
            definition.label,
            definition.buildPayload(resolved.credentials),
            resolved.existingIdpId,
          );
          idpIds = { ...idpIds, [providerId]: id };
        }
      }

      for (const provider of Object.keys(idpIds)) {
        if (!providers.includes(provider)) {
          delete idpIds[provider];
        }
      }

      const next = mergeAuthConfig(current, {
        providers,
        allowPassword: patch.allowPassword,
        idpIds,
        providerLabels: {
          ...(current.providerLabels ?? {}),
          ...Object.fromEntries(
            providers
              .filter((id): id is keyof typeof IDP_PROVIDER_REGISTRY => id in IDP_PROVIDER_REGISTRY)
              .map((id) => [id, IDP_PROVIDER_REGISTRY[id].label]),
          ),
        },
        providerIconAssets: { ...(current.providerIconAssets ?? {}) },
      });

      await tenantSettings.upsert(orgId, {
        slug: settings.slug,
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
