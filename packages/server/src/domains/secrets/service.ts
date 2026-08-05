import {
  createLLMProvider,
  createLLMProviderForApiKey,
  type LLMProvider,
} from "../ai-pipeline/providers";
import type { TenantSettingsService } from "../documents/ports";
import type {
  CommsCredentials,
  CommsProviderName,
  GetOrgSecretInput,
  OrgSecretKind,
  PutOrgSecretInput,
  ResolvedLlmApiKey,
  SecretStorePort,
  SecretsService,
} from "./ports";

const LLM_PROVIDERS = ["openai", "anthropic"] as const;
type LlmProviderName = (typeof LLM_PROVIDERS)[number];

type LlmKeyCacheEntry = {
  value: ResolvedLlmApiKey | null;
  expiresAt: number;
};

const llmKeyCache = new Map<string, LlmKeyCacheEntry>();

function llmCacheTtlMs(): number {
  const sec = Number(process.env.SECRETS_LLM_CACHE_TTL_SEC ?? 0);
  if (!Number.isFinite(sec) || sec <= 0) return 0;
  return Math.floor(sec * 1000);
}

function llmCacheKey(orgId: string, requestedProvider?: LlmProviderName): string {
  return `${orgId}:${requestedProvider ?? "_auto"}`;
}

function readLlmCache(key: string): ResolvedLlmApiKey | null | undefined {
  const ttlMs = llmCacheTtlMs();
  if (ttlMs <= 0) return undefined;
  const entry = llmKeyCache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    llmKeyCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeLlmCache(key: string, value: ResolvedLlmApiKey | null): void {
  const ttlMs = llmCacheTtlMs();
  if (ttlMs <= 0) return;
  llmKeyCache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function invalidateLlmCache(orgId: string): void {
  for (const key of llmKeyCache.keys()) {
    if (key.startsWith(`${orgId}:`)) {
      llmKeyCache.delete(key);
    }
  }
}

function isLlmProviderName(value: string): value is LlmProviderName {
  return (LLM_PROVIDERS as readonly string[]).includes(value);
}

function readPreferredLlmProvider(integrations: Record<string, unknown>): LlmProviderName | null {
  const llm = integrations.llm;
  if (!llm || typeof llm !== "object") return null;
  const provider = (llm as { provider?: unknown }).provider;
  return typeof provider === "string" && isLlmProviderName(provider) ? provider : null;
}

const COMMS_PROVIDERS = ["resend", "ses", "twilio"] as const;

function isCommsProviderName(value: string): value is CommsProviderName {
  return (COMMS_PROVIDERS as readonly string[]).includes(value);
}

function readCommsConfig(integrations: Record<string, unknown>): {
  provider: CommsProviderName;
  fromEmail?: string;
  fromName?: string;
} {
  const comms = integrations.comms;
  if (!comms || typeof comms !== "object") {
    return { provider: "resend" };
  }
  const row = comms as {
    emailProvider?: unknown;
    fromEmail?: unknown;
    fromName?: unknown;
  };
  const provider =
    typeof row.emailProvider === "string" && isCommsProviderName(row.emailProvider)
      ? row.emailProvider
      : "resend";
  return {
    provider,
    fromEmail: typeof row.fromEmail === "string" ? row.fromEmail : undefined,
    fromName: typeof row.fromName === "string" ? row.fromName : undefined,
  };
}

export function createSecretsService(deps: {
  store: SecretStorePort;
  tenantSettings?: TenantSettingsService;
}): SecretsService {
  const { store, tenantSettings } = deps;

  async function orgLlmKey(orgId: string, provider: LlmProviderName): Promise<string | null> {
    const secret = await store.getOrgSecret({ orgId, kind: "llm", provider });
    return secret?.apiKey ?? null;
  }

  async function resolveLlmApiKey(
    orgId: string,
    requestedProvider?: LlmProviderName,
  ): Promise<ResolvedLlmApiKey | null> {
    const cacheKey = llmCacheKey(orgId, requestedProvider);
    const cached = readLlmCache(cacheKey);
    if (cached !== undefined) return cached;

    let preferred: LlmProviderName | null = requestedProvider ?? null;
    if (!preferred && tenantSettings) {
      const settings = await tenantSettings.get(orgId);
      preferred = readPreferredLlmProvider(settings.integrations as Record<string, unknown>);
    }

    const order: LlmProviderName[] = preferred
      ? [preferred, ...LLM_PROVIDERS.filter((p) => p !== preferred)]
      : [...LLM_PROVIDERS];

    for (const provider of order) {
      const apiKey = await orgLlmKey(orgId, provider);
      if (apiKey) {
        const resolved = { provider, apiKey, source: "org" as const };
        writeLlmCache(cacheKey, resolved);
        return resolved;
      }
    }

    for (const provider of LLM_PROVIDERS) {
      const platformKey = await store.getPlatformSecret(`${provider}_api_key`);
      if (platformKey) {
        const resolved = { provider, apiKey: platformKey, source: "platform" as const };
        writeLlmCache(cacheKey, resolved);
        return resolved;
      }
    }

    writeLlmCache(cacheKey, null);
    return null;
  }

  async function resolveLLMProvider(orgId: string): Promise<LLMProvider> {
    const resolved = await resolveLlmApiKey(orgId);
    if (resolved) return createLLMProviderForApiKey(resolved.provider, resolved.apiKey);
    return createLLMProvider();
  }

  async function resolveCommsCredentials(orgId: string): Promise<CommsCredentials | null> {
    const config = tenantSettings
      ? readCommsConfig((await tenantSettings.get(orgId)).integrations as Record<string, unknown>)
      : { provider: "resend" as CommsProviderName };

    const orgSecret = await store.getOrgSecret({
      orgId,
      kind: "comms",
      provider: config.provider,
    });
    const orgKey = orgSecret?.apiKey;
    if (orgKey) {
      return {
        provider: config.provider,
        apiKey: orgKey,
        secretKey: orgSecret.secretKey,
        region: orgSecret.region,
        fromEmail: config.fromEmail ?? orgSecret.fromEmail,
        fromName: config.fromName ?? orgSecret.fromName,
      };
    }

    const platformKey = await store.getPlatformSecret(`${config.provider}_api_key`);
    if (platformKey) {
      const platformSecret = await store.getPlatformSecret(`${config.provider}_secret_key`);
      const platformRegion = await store.getPlatformSecret(`${config.provider}_region`);
      return {
        provider: config.provider,
        apiKey: platformKey,
        secretKey: platformSecret ?? undefined,
        region: platformRegion ?? undefined,
        fromEmail: config.fromEmail,
        fromName: config.fromName,
      };
    }

    return null;
  }

  return {
    resolveLLMProvider,
    resolveLlmApiKey,
    resolveCommsCredentials,

    async putOrgSecret(input: PutOrgSecretInput): Promise<void> {
      await store.putOrgSecret(input);
      if (input.kind === "llm") {
        invalidateLlmCache(input.orgId);
      }
    },

    async hasOrgSecret(orgId: string, kind: OrgSecretKind, provider: string): Promise<boolean> {
      return store.hasOrgSecret(orgId, kind, provider);
    },

    async getOrgSecret(orgId: string, kind: OrgSecretKind, provider: string) {
      return store.getOrgSecret({ orgId, kind, provider });
    },
  };
}

export type { GetOrgSecretInput, PutOrgSecretInput };
