export type LlmProviderName = "openai" | "anthropic";
export type CommsProviderName = "resend" | "twilio";

/** External integration unique key — any id enabled in the platform OAuth catalog. */
export type IntegrationId = string;

export interface IntegrationCatalogEntry {
  integrationId: string;
  displayName?: string;
  provider?: string;
  logo?: string;
}

export interface OAuthConnectionPublic extends IntegrationCatalogEntry {
  connected: boolean;
  connectionId?: string;
}

export interface ConnectSessionResult {
  token: string;
  connectLink: string;
  expiresAt: string;
}

export interface IntegrationOAuthPort {
  isConfigured(): boolean;
  listIntegrations(): Promise<IntegrationCatalogEntry[]>;
  createConnectSession(input: {
    orgId: string;
    endUserId: string;
    endUserEmail?: string;
    integrationId: string;
  }): Promise<ConnectSessionResult>;
  verifyWebhook(body: string, headers: Record<string, string | undefined>): boolean;
  triggerAction(
    integrationId: string,
    connectionId: string,
    actionName: string,
    input?: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface CommsIntegrationPublic {
  emailProvider: CommsProviderName;
  hasOrgKey: boolean;
  fromEmail?: string;
  fromName?: string;
}

export interface CommsIntegrationUpdate {
  emailProvider: CommsProviderName;
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
}

export interface LlmIntegrationPublic {
  provider: LlmProviderName;
  hasOrgKey: boolean;
  allowPlatformFallback: boolean;
}

export interface LlmIntegrationUpdate {
  provider: LlmProviderName;
  apiKey?: string;
  allowPlatformFallback?: boolean;
}

export interface OAuthConnectionsPublic {
  oauthConfigured: boolean;
  connections: OAuthConnectionPublic[];
}

export interface IntegrationsService {
  getLlmConfig(orgId: string): Promise<LlmIntegrationPublic>;
  updateLlmConfig(
    orgId: string,
    actorId: string,
    patch: LlmIntegrationUpdate,
  ): Promise<LlmIntegrationPublic>;
  getCommsConfig(orgId: string): Promise<CommsIntegrationPublic>;
  updateCommsConfig(
    orgId: string,
    actorId: string,
    patch: CommsIntegrationUpdate,
  ): Promise<CommsIntegrationPublic>;
  getOAuthConnections(orgId: string): Promise<OAuthConnectionsPublic>;
  createOAuthConnectSession(
    orgId: string,
    actorId: string,
    actorEmail: string | undefined,
    integrationId: string,
  ): Promise<ConnectSessionResult>;
  handleOAuthWebhook(payload: unknown): Promise<void>;
  triggerOAuthAction(
    orgId: string,
    integrationId: string,
    actionName: string,
    input?: Record<string, unknown>,
  ): Promise<unknown>;
}
