import { Nango } from "@nangohq/node";
import type {
  ConnectSessionResult,
  IntegrationOAuthPort,
  IntegrationCatalogEntry,
} from "../ports";

export interface NangoAdapterConfig {
  host: string;
  secretKey: string;
  webhookSigningKey?: string;
  webhookBaseUrl?: string;
}

function sessionWebhookUrl(baseUrl: string | undefined): string | undefined {
  const trimmed = baseUrl?.trim();
  if (!trimmed) return undefined;
  return `${trimmed.replace(/\/$/, "")}/api/integrations/nango/webhook`;
}

export function createNangoAdapter(config: NangoAdapterConfig | null): IntegrationOAuthPort | null {
  if (!config?.secretKey?.trim()) return null;

  const client = new Nango({
    host: config.host.replace(/\/$/, ""),
    secretKey: config.secretKey.trim(),
    webhookSigningKey: config.webhookSigningKey?.trim() || undefined,
  });

  const webhookBaseUrl = config.webhookBaseUrl?.trim();

  return {
    isConfigured(): boolean {
      return true;
    },

    async listIntegrations(): Promise<IntegrationCatalogEntry[]> {
      const { configs } = await client.listIntegrations();
      return configs.map((row) => ({
        integrationId: row.unique_key,
        displayName: row.display_name ?? row.unique_key,
        provider: row.provider,
        logo: row.logo,
      }));
    },

    async createConnectSession(input): Promise<ConnectSessionResult> {
      const webhookUrl = sessionWebhookUrl(webhookBaseUrl);
      const tags: Record<string, string> = {
        end_user_id: input.endUserId,
        organization_id: input.orgId,
        integration_id: input.integrationId,
      };
      if (input.endUserEmail) {
        tags.end_user_email = input.endUserEmail;
      }

      const { data } = await client.createConnectSession({
        tags,
        allowed_integrations: [input.integrationId],
        ...(webhookUrl ? { webhook_url_override: webhookUrl } : {}),
      });

      return {
        token: data.token,
        connectLink: data.connect_link,
        expiresAt: data.expires_at,
      };
    },

    verifyWebhook(body: string, headers: Record<string, string | undefined>): boolean {
      return client.verifyIncomingWebhookRequest(body, headers);
    },

    async triggerAction(
      integrationId: string,
      connectionId: string,
      actionName: string,
      input?: Record<string, unknown>,
    ): Promise<unknown> {
      return client.triggerAction(integrationId, connectionId, actionName, input);
    },
  };
}

export function nangoAdapterFromEnv(): IntegrationOAuthPort | null {
  const secretKey = process.env.NANGO_SECRET_KEY?.trim();
  if (!secretKey) return null;

  return createNangoAdapter({
    host: process.env.NANGO_HOST?.trim() || "http://localhost:3003",
    secretKey,
    webhookSigningKey: process.env.NANGO_WEBHOOK_SIGNING_KEY?.trim(),
    webhookBaseUrl: process.env.NANGO_WEBHOOK_BASE_URL?.trim(),
  });
}
