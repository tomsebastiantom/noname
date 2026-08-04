export type LlmProviderName = "openai" | "anthropic";
export type CommsProviderName = "resend" | "twilio";

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
}
