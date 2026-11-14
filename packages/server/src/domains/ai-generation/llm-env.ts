/** OpenAI-compatible base URL — e.g. local LiteLLM `http://localhost:4000/v1`. */
export function openAiCompatibleBaseUrl(): string | null {
  const raw = process.env.OPENAI_BASE_URL?.trim() || process.env.LITELLM_PROXY_URL?.trim();
  if (!raw) return null;
  return raw.replace(/\/$/, "");
}

/** Model id sent to OpenAI-compatible `/chat/completions` (strip `provider/` prefix). */
export function openAiCompatibleModelId(modelSpec?: string): string {
  const spec =
    modelSpec?.trim() ||
    process.env.MASTRA_PLANNER_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4o-mini";
  const slash = spec.indexOf("/");
  return slash === -1 ? spec : spec.slice(slash + 1);
}

/** Local dev: LiteLLM often accepts any bearer when OPENAI_BASE_URL points at localhost. */
export function envOpenAiApiKey(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (key) return key;
  const base = openAiCompatibleBaseUrl();
  if (base && process.env.NODE_ENV !== "production") {
    return "sk-local";
  }
  return null;
}
