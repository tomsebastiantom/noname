import type { LLMProvider } from "../ai-pipeline/providers";

export type OrgSecretKind = "llm" | "comms" | "webhooks";

export type CommsProviderName = "resend" | "ses" | "twilio";

export interface CommsCredentials {
  provider: CommsProviderName;
  apiKey: string;
  secretKey?: string;
  region?: string;
  fromEmail?: string;
  fromName?: string;
}

export interface PutOrgSecretInput {
  orgId: string;
  kind: OrgSecretKind;
  provider: string;
  payload: Record<string, string>;
  updatedBy: string;
}

export interface GetOrgSecretInput {
  orgId: string;
  kind: OrgSecretKind;
  provider: string;
}

export interface SecretStorePort {
  putOrgSecret(input: PutOrgSecretInput): Promise<void>;
  getOrgSecret(input: GetOrgSecretInput): Promise<Record<string, string> | null>;
  hasOrgSecret(orgId: string, kind: OrgSecretKind, provider: string): Promise<boolean>;
  getPlatformSecret(name: string): Promise<string | null>;
}

export type LlmCredentialSource = "org" | "platform";

export interface ResolvedLlmApiKey {
  provider: "openai" | "anthropic";
  apiKey: string;
  source: LlmCredentialSource;
}

export interface SecretsService {
  resolveLLMProvider(orgId: string): Promise<LLMProvider>;
  /** Org Vault BYOK → platform Vault — never env (callers add dev env fallback if needed). */
  resolveLlmApiKey(
    orgId: string,
    requestedProvider?: "openai" | "anthropic",
  ): Promise<ResolvedLlmApiKey | null>;
  resolveCommsCredentials(orgId: string): Promise<CommsCredentials | null>;
  putOrgSecret(input: PutOrgSecretInput): Promise<void>;
  hasOrgSecret(orgId: string, kind: OrgSecretKind, provider: string): Promise<boolean>;
  getOrgSecret(
    orgId: string,
    kind: OrgSecretKind,
    provider: string,
  ): Promise<Record<string, string> | null>;
}

export interface VaultConfig {
  addr: string;
  token: string;
  mount: string;
  pathPrefix: string;
}
