import type { TenantSettingsService } from "../documents/ports";
import type { SecretsService } from "../secrets/ports";
import type {
  CommsIntegrationPublic,
  CommsIntegrationUpdate,
  CommsProviderName,
  IntegrationsService,
  LlmIntegrationPublic,
  LlmIntegrationUpdate,
  LlmProviderName,
} from "./ports";

function normalizeProvider(value: string | undefined): LlmProviderName {
  return value === "anthropic" ? "anthropic" : "openai";
}

function normalizeCommsProvider(value: string | undefined): CommsProviderName {
  return value === "twilio" ? "twilio" : "resend";
}

export function createIntegrationsService(deps: {
  secrets: SecretsService;
  tenantSettings: TenantSettingsService;
}): IntegrationsService {
  const { secrets, tenantSettings } = deps;

  async function getLlmConfig(orgId: string): Promise<LlmIntegrationPublic> {
    const settings = await tenantSettings.get(orgId);
    const llm = settings.integrations.llm;
    const provider = normalizeProvider(llm?.provider);
    const hasOrgKey = await secrets.hasOrgSecret(orgId, "llm", provider);

    return {
      provider,
      hasOrgKey,
      allowPlatformFallback: llm?.allowPlatformFallback !== false,
    };
  }

  async function getCommsConfig(orgId: string): Promise<CommsIntegrationPublic> {
    const settings = await tenantSettings.get(orgId);
    const comms = settings.integrations.comms;
    const emailProvider = normalizeCommsProvider(comms?.emailProvider);
    const hasOrgKey = await secrets.hasOrgSecret(orgId, "comms", emailProvider);

    return {
      emailProvider,
      hasOrgKey,
      fromEmail: comms?.fromEmail,
      fromName: comms?.fromName,
    };
  }

  return {
    getLlmConfig,
    getCommsConfig,

    async updateLlmConfig(
      orgId: string,
      actorId: string,
      patch: LlmIntegrationUpdate,
    ): Promise<LlmIntegrationPublic> {
      const provider = normalizeProvider(patch.provider);
      const apiKey = patch.apiKey?.trim();

      if (apiKey) {
        await secrets.putOrgSecret({
          orgId,
          kind: "llm",
          provider,
          payload: {
            apiKey,
            updatedAt: new Date().toISOString(),
            updatedBy: actorId,
          },
          updatedBy: actorId,
        });
      }

      const current = await tenantSettings.get(orgId);
      await tenantSettings.upsert(orgId, {
        slug: current.slug,
        locales: current.locales,
        defaultLocale: current.defaultLocale,
        seo: current.seo,
        auth: current.auth,
        integrations: {
          ...current.integrations,
          llm: {
            provider,
            allowPlatformFallback:
              patch.allowPlatformFallback ??
              current.integrations.llm?.allowPlatformFallback ??
              true,
          },
        },
      });

      return getLlmConfig(orgId);
    },

    async updateCommsConfig(
      orgId: string,
      actorId: string,
      patch: CommsIntegrationUpdate,
    ): Promise<CommsIntegrationPublic> {
      const emailProvider = normalizeCommsProvider(patch.emailProvider);
      const apiKey = patch.apiKey?.trim();

      if (apiKey) {
        await secrets.putOrgSecret({
          orgId,
          kind: "comms",
          provider: emailProvider,
          payload: {
            apiKey,
            updatedAt: new Date().toISOString(),
            updatedBy: actorId,
          },
          updatedBy: actorId,
        });
      }

      const current = await tenantSettings.get(orgId);
      await tenantSettings.upsert(orgId, {
        slug: current.slug,
        locales: current.locales,
        defaultLocale: current.defaultLocale,
        seo: current.seo,
        auth: current.auth,
        integrations: {
          ...current.integrations,
          comms: {
            emailProvider,
            fromEmail: patch.fromEmail ?? current.integrations.comms?.fromEmail,
            fromName: patch.fromName ?? current.integrations.comms?.fromName,
          },
        },
      });

      return getCommsConfig(orgId);
    },
  };
}
