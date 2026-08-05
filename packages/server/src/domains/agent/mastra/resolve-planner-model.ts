import type { OpenAICompatibleConfig } from "@mastra/core/llm";
import type { ResolvedLlmApiKey, SecretsService } from "../../secrets/ports";

export type PlannerCredentialSource = ResolvedLlmApiKey["source"] | "env" | "router";

export type ResolvedPlannerModel = {
  model: string | OpenAICompatibleConfig;
  credentialSource: PlannerCredentialSource;
};

const LLM_PROVIDERS = ["openai", "anthropic"] as const;
type LlmProviderName = (typeof LLM_PROVIDERS)[number];

function isLlmProviderName(value: string): value is LlmProviderName {
  return (LLM_PROVIDERS as readonly string[]).includes(value);
}

function defaultPlannerModelSpec(): string {
  return process.env.MASTRA_PLANNER_MODEL?.trim() || "openai/gpt-4o-mini";
}

function parseModelRouterId(model: string): { provider: string; modelId: string } {
  const slash = model.indexOf("/");
  if (slash === -1) {
    return { provider: "openai", modelId: model };
  }
  return {
    provider: model.slice(0, slash),
    modelId: model.slice(slash + 1),
  };
}

function withApiKey(model: string, apiKey: string): OpenAICompatibleConfig {
  return { id: model as `${string}/${string}`, apiKey };
}

function envApiKey(provider: LlmProviderName): string | null {
  if (provider === "openai") return process.env.OPENAI_API_KEY?.trim() || null;
  return process.env.ANTHROPIC_API_KEY?.trim() || null;
}

/** Resolve Mastra planner credentials from Vault at agent run time (no worker env sync). */
export async function resolvePlannerModel(
  orgId: string,
  secrets: Pick<SecretsService, "resolveLlmApiKey">,
  modelSpec?: string,
): Promise<ResolvedPlannerModel> {
  const model = modelSpec?.trim() || defaultPlannerModelSpec();
  const { provider } = parseModelRouterId(model);

  if (isLlmProviderName(provider)) {
    const resolved = await secrets.resolveLlmApiKey(orgId, provider);
    if (resolved) {
      return {
        model: withApiKey(model, resolved.apiKey),
        credentialSource: resolved.source,
      };
    }

    const envKey = envApiKey(provider);
    if (envKey) {
      return {
        model: withApiKey(model, envKey),
        credentialSource: "env",
      };
    }
  }

  return { model, credentialSource: "router" };
}
