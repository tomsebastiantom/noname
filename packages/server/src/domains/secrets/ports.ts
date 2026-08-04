import type { LLMProvider } from "../ai-pipeline/providers";

export type OrgSecretKind = "llm" | "comms";

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

export interface SecretsService {
  resolveLLMProvider(orgId: string): Promise<LLMProvider>;
  putOrgSecret(input: PutOrgSecretInput): Promise<void>;
  hasOrgSecret(orgId: string, kind: OrgSecretKind, provider: string): Promise<boolean>;
}

export interface VaultConfig {
  addr: string;
  token: string;
  mount: string;
  pathPrefix: string;
}
