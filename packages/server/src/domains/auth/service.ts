import { mapWithConcurrency } from "../../shared/concurrency";
import { ServiceUnavailableError, ValidationError } from "../../shared/domain-error";
import {
  type AssetDocumentService,
  type ContentDocumentService,
  idpIdForProvider,
  isBuiltinLoginProvider,
  listPublishedAuthProviders,
  type MediaRef,
  mergeAuthConfig,
  normalizeAuthConfig,
  resolveLoginProviders,
  type TenantSettingsService,
} from "../documents/contracts";
import type { NotificationsService } from "../notifications/ports";
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
import { assertPasswordResetEnabled } from "./auth-flow-guards";
import {
  credentialsFromPatch,
  IDP_PROVIDER_IDS,
  IDP_PROVIDER_REGISTRY,
  type IdpProviderId,
  publicProviderLabels,
  resolveIdpUpdate,
} from "./idp-registry";
import type { AuthConfig, AuthService } from "./ports";

export function createAuthService(deps: {
  tenantSettings: TenantSettingsService;
  assets: AssetDocumentService;
  content: Pick<ContentDocumentService, "findByType">;
  notifications?: Pick<NotificationsService, "notify">;
}): AuthService {
  const { tenantSettings, assets, content, notifications } = deps;

  async function loadAuth(orgId: string) {
    const settings = await tenantSettings.get(orgId);
    return normalizeAuthConfig(settings.auth);
  }

  async function publicConfig(orgId: string): Promise<AuthConfig> {
    const auth = await loadAuth(orgId);
    const publishedProviders = await listPublishedAuthProviders(content, orgId);
    const providers = resolveLoginProviders(auth, publishedProviders);
    const allowPassword = auth.allowPassword;

    const providerLabels: Record<string, string> = { ...(auth.providerLabels ?? {}) };
    const providerIconAssets: Record<string, MediaRef> = { ...(auth.providerIconAssets ?? {}) };
    for (const provider of publishedProviders) {
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
      assertPasswordResetEnabled(auth);
      const settings = await tenantSettings.get(input.orgId);
      const slug = settings.slug?.trim();
      if (!slug) {
        throw new ValidationError("slug", "Store slug is required for password reset emails");
      }

      const userId = await findUserIdByEmail(input.orgId, input.email);
      if (userId) {
        await requestPasswordResetEmail(input.orgId, userId, passwordResetUrlTemplate(slug));
      }
      // Always succeed — do not reveal whether the email exists.
    },

    async confirmPasswordReset(input) {
      const auth = await loadAuth(input.orgId);
      assertPasswordResetEnabled(auth);
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
        throw new ValidationError("signUp", "Sign-up is not enabled for this store");
      }
      if (!auth.allowPassword) {
        throw new ValidationError(
          "signUp",
          "Password sign-up requires email/password login to be enabled",
        );
      }
      return registerHumanUser(input.orgId, input);
    },

    getConfig: publicConfig,

    async updateConfig(orgId, patch) {
      const settings = await tenantSettings.get(orgId);
      const current = normalizeAuthConfig(settings.auth);
      let idpIds = patch.idpIds ? { ...current.idpIds, ...patch.idpIds } : { ...current.idpIds };

      const publishedProviders = await listPublishedAuthProviders(content, orgId);
      const cmsEnabledIds = publishedProviders.filter((p) => p.enabled).map((p) => p.providerId);

      const providersForUpdate = new Set<IdpProviderId>(
        cmsEnabledIds.filter((id): id is IdpProviderId => isBuiltinLoginProvider(id)),
      );
      for (const providerId of IDP_PROVIDER_IDS) {
        if (credentialsFromPatch(providerId, patch)) {
          providersForUpdate.add(providerId);
        }
      }
      if (patch.providers) {
        for (const providerId of patch.providers) {
          if (isBuiltinLoginProvider(providerId)) {
            providersForUpdate.add(providerId as IdpProviderId);
          }
        }
      }

      const patchWithProviders = {
        ...patch,
        providers: [...providersForUpdate],
      };

      for (const providerId of IDP_PROVIDER_IDS) {
        const definition = IDP_PROVIDER_REGISTRY[providerId];
        const resolved = resolveIdpUpdate(providerId, current, patchWithProviders);

        if (resolved.required && !resolved.credentials && !resolved.existingIdpId) {
          throw new ValidationError("credentials", definition.missingCredentialsError);
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
        if (!cmsEnabledIds.includes(provider)) {
          delete idpIds[provider];
        }
      }

      const next = mergeAuthConfig(current, {
        providers: cmsEnabledIds.filter((id) => isBuiltinLoginProvider(id)),
        allowPassword: patch.allowPassword,
        allowSignUp: patch.allowSignUp,
        allowPasswordReset: patch.allowPasswordReset,
        requireMfaForAdmin: patch.requireMfaForAdmin,
        idpIds,
        providerLabels: { ...(current.providerLabels ?? {}) },
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
      const teamUsers = users.filter((user) => roleMap.has(user.userId));

      // One Zitadel call per user for the MFA column — Zitadel's search API has no
      // "authentication factors for N users" batch endpoint, so this fans out with bounded
      // concurrency rather than either a `for` loop (O(n) sequential latency) or an unbounded
      // `Promise.all` (risks tripping Zitadel's per-org rate limit on large teams).
      const mfaEnrolledByUserId = await mapWithConcurrency(teamUsers, 10, async (user) => [
        user.userId,
        await userHasTotpFactor(orgId, user.userId),
      ] as const);
      const mfaMap = new Map(mfaEnrolledByUserId);

      return teamUsers.map((user) => ({
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        state: user.state,
        role: roleMap.get(user.userId) ?? "editor",
        mfaEnrolled: mfaMap.get(user.userId) ?? false,
      }));
    },

    async inviteTeamUser(orgId, input) {
      const settings = await tenantSettings.get(orgId);
      const slug = settings.slug?.trim();
      if (!slug) {
        throw new ValidationError("slug", "Store slug is required to invite users");
      }

      const { userId } = await inviteHumanUser(orgId, slug, input);
      const projectId = zitadelProjectId();
      await upsertUserTeamRole(orgId, projectId, userId, input.role);

      if (notifications) {
        try {
          const fullName = [input.givenName, input.familyName]
            .map((part) => part?.trim())
            .filter(Boolean)
            .join(" ");
          const name = fullName || input.email.split("@")[0] || "there";
          await notifications.notify(orgId, {
            trigger: "welcome",
            to: input.email,
            userId,
            variables: { name, storeName: slug },
            idempotencyKey: `welcome:${userId}`,
          });
        } catch (err) {
          console.warn("[auth.inviteTeamUser] welcome notification failed:", err);
        }
      }

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
        throw new ServiceUnavailableError(
          `Identity provider "${input.provider}" is not configured for this org`,
          { provider: input.provider },
        );
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
} from "../documents/contracts";
