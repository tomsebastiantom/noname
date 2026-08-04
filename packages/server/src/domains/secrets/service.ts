import {
  createLLMProvider,
  createLLMProviderForApiKey,
  type LLMProvider,
} from "../ai-pipeline/providers";
import type { TenantSettingsService } from "../documents/ports";
import type {
  GetOrgSecretInput,
  OrgSecretKind,
  PutOrgSecretInput,
  SecretStorePort,
  SecretsService,
} from "./ports";

const LLM_PROVIDERS = ["openai", "anthropic"] as const;
type LlmProviderName = (typeof LLM_PROVIDERS)[number];

function isLlmProviderName(value: string): value is LlmProviderName {
  return (LLM_PROVIDERS as readonly string[]).includes(value);
}

function readPreferredLlmProvider(integrations: Record<string, unknown>): LlmProviderName | null {
  const llm = integrations.llm;
  if (!llm || typeof llm !== "object") return null;
  const provider = (llm as { provider?: unknown }).provider;
  return typeof provider === "string" && isLlmProviderName(provider) ? provider : null;
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

  async function resolveLLMProvider(orgId: string): Promise<LLMProvider> {
    let preferred: LlmProviderName | null = null;
    if (tenantSettings) {
      const settings = await tenantSettings.get(orgId);
      preferred = readPreferredLlmProvider(settings.integrations as Record<string, unknown>);
    }

    const order: LlmProviderName[] = preferred
      ? [preferred, ...LLM_PROVIDERS.filter((p) => p !== preferred)]
      : [...LLM_PROVIDERS];

    for (const provider of order) {
      const apiKey = await orgLlmKey(orgId, provider);
      if (apiKey) return createLLMProviderForApiKey(provider, apiKey);
    }

    for (const provider of LLM_PROVIDERS) {
      const platformKey = await store.getPlatformSecret(`${provider}_api_key`);
      if (platformKey) return createLLMProviderForApiKey(provider, platformKey);
    }

    return createLLMProvider();
  }

  return {
    resolveLLMProvider,

    async putOrgSecret(input: PutOrgSecretInput): Promise<void> {
      await store.putOrgSecret(input);
    },

    async hasOrgSecret(orgId: string, kind: OrgSecretKind, provider: string): Promise<boolean> {
      return store.hasOrgSecret(orgId, kind, provider);
    },
  };
}

export type { GetOrgSecretInput, PutOrgSecretInput };
