import type { TenantSettingsService } from "../documents/ports";
import type { SecretsService } from "../secrets/ports";
import { isCommsProviderName, type CommsProviderName } from "@noname/shared";
import { parseIntegrationId } from "./integration-id";
import { mergeOAuthConnections, readOAuthConnectionMap } from "./oauth-connections";
import type {
  CommsIntegrationPublic,
  CommsIntegrationUpdate,
  ConnectSessionResult,
  IntegrationOAuthPort,
  IntegrationsService,
  LlmIntegrationPublic,
  LlmIntegrationUpdate,
  LlmProviderName,
  OAuthConnectionsPublic,
} from "./ports";

function normalizeProvider(value: string | undefined): LlmProviderName {
  return value === "anthropic" ? "anthropic" : "openai";
}

function normalizeCommsProvider(value: string | undefined): CommsProviderName {
  if (typeof value === "string" && isCommsProviderName(value)) {
    return value;
  }
  return "resend";
}

export function createIntegrationsService(deps: {
  secrets: SecretsService;
  tenantSettings: TenantSettingsService;
  oauth?: IntegrationOAuthPort | null;
}): IntegrationsService {
  const { secrets, tenantSettings, oauth = null } = deps;

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
      mailgunDomain: comms?.mailgunDomain,
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
            mailgunDomain: patch.mailgunDomain ?? current.integrations.comms?.mailgunDomain,
          },
        },
      });

      return getCommsConfig(orgId);
    },

    async getOAuthConnections(orgId: string): Promise<OAuthConnectionsPublic> {
      const settings = await tenantSettings.get(orgId);
      const stored = readOAuthConnectionMap(settings.integrations);

      if (!oauth?.isConfigured()) {
        return {
          oauthConfigured: false,
          connections: mergeOAuthConnections([], stored),
        };
      }

      const catalog = await oauth.listIntegrations();
      return {
        oauthConfigured: true,
        connections: mergeOAuthConnections(catalog, stored),
      };
    },

    async createOAuthConnectSession(
      orgId: string,
      actorId: string,
      actorEmail: string | undefined,
      integrationId: string,
    ): Promise<ConnectSessionResult> {
      if (!oauth?.isConfigured()) {
        throw new Error("OAuth integrations are not configured on this server");
      }
      const id = parseIntegrationId(integrationId);
      return oauth.createConnectSession({
        orgId,
        endUserId: actorId,
        endUserEmail: actorEmail,
        integrationId: id,
      });
    },

    async handleOAuthWebhook(payload: unknown): Promise<void> {
      if (!payload || typeof payload !== "object") return;

      const body = payload as Record<string, unknown>;
      if (body.type !== "auth" || body.success !== true) return;
      const operation = body.operation;
      if (operation !== "creation" && operation !== "override") return;

      const connectionId = typeof body.connectionId === "string" ? body.connectionId.trim() : "";
      if (!connectionId) return;

      const tags =
        body.tags && typeof body.tags === "object" ? (body.tags as Record<string, unknown>) : {};
      const orgId = typeof tags.organization_id === "string" ? tags.organization_id.trim() : "";
      if (!orgId) return;

      const integrationIdRaw =
        typeof body.providerConfigKey === "string"
          ? body.providerConfigKey.trim()
          : typeof tags.integration_id === "string"
            ? tags.integration_id.trim()
            : "";
      if (!integrationIdRaw) return;

      let integrationId: string;
      try {
        integrationId = parseIntegrationId(integrationIdRaw);
      } catch {
        return;
      }

      const current = await tenantSettings.get(orgId);
      const connections = readOAuthConnectionMap(current.integrations);
      connections[integrationId] = { connectionId };

      await tenantSettings.upsert(orgId, {
        slug: current.slug,
        locales: current.locales,
        defaultLocale: current.defaultLocale,
        seo: current.seo,
        auth: current.auth,
        integrations: {
          ...current.integrations,
          nango: connections,
        },
      });
    },

    async triggerOAuthAction(
      orgId: string,
      integrationId: string,
      actionName: string,
      input?: Record<string, unknown>,
    ): Promise<unknown> {
      if (!oauth?.isConfigured()) {
        throw new Error("OAuth integrations are not configured");
      }

      const id = parseIntegrationId(integrationId);
      const settings = await tenantSettings.get(orgId);
      const connectionId = readOAuthConnectionMap(settings.integrations)[id]?.connectionId;
      if (!connectionId) {
        throw new Error(`No ${id} connection for org ${orgId}`);
      }

      return oauth.triggerAction(id, connectionId, actionName, input);
    },
  };
}
