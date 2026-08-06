import { afterEach, describe, expect, it } from "vitest";
import { envOpenAiApiKey, openAiCompatibleBaseUrl, openAiCompatibleModelId } from "./llm-env";

describe("llm-env", () => {
  afterEach(() => {
    delete process.env.OPENAI_BASE_URL;
    delete process.env.LITELLM_PROXY_URL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.MASTRA_PLANNER_MODEL;
    delete process.env.OPENAI_MODEL;
    delete process.env.NODE_ENV;
  });

  it("reads LiteLLM base URL from OPENAI_BASE_URL", () => {
    process.env.OPENAI_BASE_URL = "http://localhost:4000/v1/";
    expect(openAiCompatibleBaseUrl()).toBe("http://localhost:4000/v1");
  });

  it("strips provider prefix for compatible model id", () => {
    process.env.MASTRA_PLANNER_MODEL = "openai/playground-gpt-5-mini";
    expect(openAiCompatibleModelId()).toBe("playground-gpt-5-mini");
  });

  it("uses sk-local when proxy base URL is set in dev", () => {
    process.env.OPENAI_BASE_URL = "http://localhost:4000/v1";
    process.env.NODE_ENV = "development";
    expect(envOpenAiApiKey()).toBe("sk-local");
  });
});
