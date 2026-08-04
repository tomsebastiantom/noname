import { apiFetch } from "../lib/api";
import { requireStoreSlug } from "./org";

export type LlmProviderName = "openai" | "anthropic";
export type CommsProviderName = "resend" | "twilio";

export interface LlmIntegrationState {
  provider: LlmProviderName;
  hasOrgKey: boolean;
  allowPlatformFallback: boolean;
}

export interface CommsIntegrationState {
  emailProvider: CommsProviderName;
  hasOrgKey: boolean;
  fromEmail?: string;
  fromName?: string;
}

export async function loadLlmIntegration(): Promise<LlmIntegrationState> {
  const storeSlug = requireStoreSlug();
  const body = await apiFetch<{ data?: LlmIntegrationState }>(
    `/api/integrations/${encodeURIComponent(storeSlug)}/llm`,
  );
  return {
    provider: body.data?.provider ?? "openai",
    hasOrgKey: body.data?.hasOrgKey === true,
    allowPlatformFallback: body.data?.allowPlatformFallback !== false,
  };
}

export async function loadCommsIntegration(): Promise<CommsIntegrationState> {
  const storeSlug = requireStoreSlug();
  const body = await apiFetch<{ data?: CommsIntegrationState }>(
    `/api/integrations/${encodeURIComponent(storeSlug)}/comms`,
  );
  return {
    emailProvider: body.data?.emailProvider ?? "resend",
    hasOrgKey: body.data?.hasOrgKey === true,
    fromEmail: body.data?.fromEmail,
    fromName: body.data?.fromName,
  };
}

export async function saveCommsIntegration(input: {
  emailProvider: CommsProviderName;
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
}): Promise<CommsIntegrationState> {
  const storeSlug = requireStoreSlug();
  const body = await apiFetch<{ data?: CommsIntegrationState }>(
    `/api/integrations/${encodeURIComponent(storeSlug)}/comms`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emailProvider: input.emailProvider,
        apiKey: input.apiKey?.trim() || undefined,
        fromEmail: input.fromEmail?.trim() || undefined,
        fromName: input.fromName?.trim() || undefined,
      }),
    },
  );
  return {
    emailProvider: body.data?.emailProvider ?? input.emailProvider,
    hasOrgKey: body.data?.hasOrgKey === true,
    fromEmail: body.data?.fromEmail,
    fromName: body.data?.fromName,
  };
}

export async function saveLlmIntegration(input: {
  provider: LlmProviderName;
  apiKey?: string;
  allowPlatformFallback: boolean;
}): Promise<LlmIntegrationState> {
  const storeSlug = requireStoreSlug();
  const body = await apiFetch<{ data?: LlmIntegrationState }>(
    `/api/integrations/${encodeURIComponent(storeSlug)}/llm`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: input.provider,
        apiKey: input.apiKey?.trim() || undefined,
        allowPlatformFallback: input.allowPlatformFallback,
      }),
    },
  );
  return {
    provider: body.data?.provider ?? input.provider,
    hasOrgKey: body.data?.hasOrgKey === true,
    allowPlatformFallback: body.data?.allowPlatformFallback !== false,
  };
}
