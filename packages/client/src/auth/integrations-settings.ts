import type { CommsProviderName } from "@noname/shared";
import { apiFetch } from "../lib/api";
import { requireStoreSlug } from "./org";

export type { CommsProviderName } from "@noname/shared";

export type LlmProviderName = "openai" | "anthropic";

export interface OAuthConnectionState {
  integrationId: string;
  displayName?: string;
  provider?: string;
  logo?: string;
  connected: boolean;
  connectionId?: string;
}

export interface OAuthConnectionsState {
  oauthConfigured: boolean;
  connections: OAuthConnectionState[];
}

export interface OAuthConnectSession {
  token: string;
  connectLink: string;
  expiresAt: string;
}

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
  mailgunDomain?: string;
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
    mailgunDomain: body.data?.mailgunDomain,
  };
}

export async function saveCommsIntegration(input: {
  emailProvider: CommsProviderName;
  apiKey?: string;
  fromEmail?: string;
  fromName?: string;
  mailgunDomain?: string;
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
        mailgunDomain: input.mailgunDomain?.trim() || undefined,
      }),
    },
  );
  return {
    emailProvider: body.data?.emailProvider ?? input.emailProvider,
    hasOrgKey: body.data?.hasOrgKey === true,
    fromEmail: body.data?.fromEmail,
    fromName: body.data?.fromName,
    mailgunDomain: body.data?.mailgunDomain,
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

export async function loadOAuthConnections(): Promise<OAuthConnectionsState> {
  const storeSlug = requireStoreSlug();
  const body = await apiFetch<{ data?: OAuthConnectionsState }>(
    `/api/integrations/${encodeURIComponent(storeSlug)}/nango/connections`,
  );
  return {
    oauthConfigured: body.data?.oauthConfigured === true,
    connections: body.data?.connections ?? [],
  };
}

export async function startOAuthConnect(integrationId: string): Promise<OAuthConnectSession> {
  const storeSlug = requireStoreSlug();
  const body = await apiFetch<{ data?: OAuthConnectSession }>(
    `/api/integrations/${encodeURIComponent(storeSlug)}/nango/session`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ integrationId }),
    },
  );
  if (!body.data?.connectLink || !body.data.token) {
    throw new Error("Failed to start OAuth connect session");
  }
  return body.data;
}
