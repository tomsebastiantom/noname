import {
  listPublishedCustomAuthProviders,
  resolveLoginProviders,
} from "../documents/content-types/auth-provider";
import type {
  AssetDocumentService,
  ContentDocumentService,
  MediaRef,
  TenantSettingsService,
} from "../documents/ports";
import {
  idpIdForProvider,
  mergeAuthConfig,
  normalizeAuthConfig,
} from "../documents/tenant/auth-config";
import { teamRoleAssignments, upsertUserTeamRole } from "./adapters/zitadel/authorizations";
import {
  buildOAuthAuthorizeUrl,
  completeLoginWithTotp,
  exchangeAuthorizationCode,
  loginWithCredentials,
} from "./adapters/zitadel/client";
import { upsertZitadelIdp } from "./adapters/zitadel/management";
import {
  startTotpRegistration,
  userHasTotpFactor,
  verifyTotpRegistration,
} from "./adapters/zitadel/mfa";
import { zitadelProjectId } from "./adapters/zitadel/project-id";
import {
  findUserIdByEmail,
  inviteHumanUser,
  listOrgUsers,
  passwordResetUrlTemplate,
  registerHumanUser,
  requestPasswordResetEmail,
  setPasswordWithVerificationCode,
} from "./adapters/zitadel/users";
import { resolveProviderIconUrls } from "./asset-url";
import {
  IDP_PROVIDER_IDS,
  IDP_PROVIDER_REGISTRY,
  publicProviderLabels,
  resolveIdpUpdate,
} from "./idp-registry";
import type { AuthConfig, AuthService } from "./ports";

export function createAuthService(deps: {
  tenantSettings: TenantSettingsService;
  assets: AssetDocumentService;
  content: Pick<ContentDocumentService, "findByType">;
}): AuthService {
  const { tenantSettings, assets, content } = deps;

  async function loadAuth(orgId: string) {
    const settings = await tenantSettings.get(orgId);
    return normalizeAuthConfig(settings.auth);
  }

  async function publicConfig(orgId: string): Promise<AuthConfig> {
    const auth = await loadAuth(orgId);
    const customProviders = await listPublishedCustomAuthProviders(content, orgId);
    const providers = resolveLoginProviders(auth, customProviders);
    const allowPassword = auth.allowPassword;

    const providerLabels = { ...(auth.providerLabels ?? {}) };
    const providerIconAssets: Record<string, MediaRef> = { ...(auth.providerIconAssets ?? {}) };
    for (const provider of customProviders) {
      if (!providers.includes(provider.providerId)) continue;
      providerLabels[provider.providerId] = provider.name;
      if (provider.iconDocumentId) {
        providerIconAssets[provider.providerId] = { documentId: provider.iconDocumentId };
      }
    }

    return {
      providers,
      allowPassword,
      allowSignUp: auth.allowSignUp === true,
      allowPasswordReset: allowPassword && auth.allowPasswordReset !== false,
      requireMfaForAdmin: auth.requireMfaForAdmin === true,
      providerLabels: publicProviderLabels(providers, providerLabels),
      providerIcons: await resolveProviderIconUrls(orgId, providers, providerIconAssets, assets),
    };
  }

  return {
    async login(input) {
      const result = await loginWithCredentials(input);
      if (result.status === "mfa_required") {
        return {
          mfaRequired: true,
          sessionId: result.sessionId,
          sessionToken: result.sessionToken,
          authRequestId: result.authRequestId,
        };
      }
      return {
        accessToken: result.accessToken,
        expiresIn: result.expiresIn,
      };
    },

    verifyMfa: (input) => completeLoginWithTotp(input),

    startTotpEnrollment: ({ userId, userToken }) => startTotpRegistration(userToken, userId),

    confirmTotpEnrollment: async (input) => {
      await verifyTotpRegistration(input.userToken, input.userId, input.code);
    },

    async requestPasswordReset(input) {
      const auth = await loadAuth(input.orgId);
      if (!auth.allowPassword || auth.allowPasswordReset === false) {
        throw new Error("Password reset is not enabled for this store");
      }
      const settings = await tenantSettings.get(input.orgId);
      const slug = settings.slug?.trim();
      if (!slug) {
        throw new Error("Store slug is required for password reset emails");
      }

      const userId = await findUserIdByEmail(input.orgId, input.email);
      if (userId) {
        await requestPasswordResetEmail(input.orgId, userId, passwordResetUrlTemplate(slug));
      }
      // Always succeed — do not reveal whether the email exists.
    },

    async confirmPasswordReset(input) {
      const auth = await loadAuth(input.orgId);
      if (!auth.allowPassword || auth.allowPasswordReset === false) {
        throw new Error("Password reset is not enabled for this store");
      }
      await setPasswordWithVerificationCode(
        input.orgId,
        input.userId,
        input.verificationCode,
        input.newPassword,
      );
    },

    async register(input) {
      const auth = await loadAuth(input.orgId);
      if (!auth.allowSignUp) {
        throw new Error("Sign-up is not enabled for this store");
      }
      if (!auth.allowPassword) {
        throw new Error("Password sign-up requires email/password login to be enabled");
      }
      return registerHumanUser(input.orgId, input);
    },

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
        allowSignUp: patch.allowSignUp,
        allowPasswordReset: patch.allowPasswordReset,
        requireMfaForAdmin: patch.requireMfaForAdmin,
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

    async getSessionStatus(orgId, userId) {
      const auth = await loadAuth(orgId);
      const mfaEnrolled = await userHasTotpFactor(orgId, userId);
      return {
        userId,
        requireMfaForAdmin: auth.requireMfaForAdmin === true,
        mfaEnrolled,
      };
    },

    async listTeamUsers(orgId) {
      const projectId = zitadelProjectId();
      const roleMap = await teamRoleAssignments(orgId, projectId);
      const users = await listOrgUsers(orgId);

      return Promise.all(
        users
          .filter((user) => roleMap.has(user.userId))
          .map(async (user) => ({
            userId: user.userId,
            email: user.email,
            displayName: user.displayName,
            state: user.state,
            role: roleMap.get(user.userId) ?? "editor",
            mfaEnrolled: await userHasTotpFactor(orgId, user.userId),
          })),
      );
    },

    async inviteTeamUser(orgId, input) {
      const settings = await tenantSettings.get(orgId);
      const slug = settings.slug?.trim();
      if (!slug) {
        throw new Error("Store slug is required to invite users");
      }

      const { userId } = await inviteHumanUser(orgId, slug, input);
      const projectId = zitadelProjectId();
      await upsertUserTeamRole(orgId, projectId, userId, input.role);

      return { userId };
    },

    async updateTeamUserRole(orgId, userId, role) {
      const projectId = zitadelProjectId();
      await upsertUserTeamRole(orgId, projectId, userId, role);
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

export {
  DEFAULT_TENANT_AUTH,
  enabledProviders,
  normalizeAuthConfig,
} from "../documents/tenant/auth-config";
