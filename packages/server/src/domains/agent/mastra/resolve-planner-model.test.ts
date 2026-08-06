import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePlannerModel } from "./resolve-planner-model";

describe("resolvePlannerModel", () => {
  afterEach(() => {
    delete process.env.MASTRA_PLANNER_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_BASE_URL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.NODE_ENV;
  });

  it("uses org Vault key for the requested provider in the model id", async () => {
    const resolveLlmApiKey = vi.fn(async () => ({
      provider: "openai" as const,
      apiKey: "sk-org-openai",
      source: "org" as const,
    }));

    const resolved = await resolvePlannerModel("org-1", { resolveLlmApiKey }, "openai/gpt-4o-mini");

    expect(resolveLlmApiKey).toHaveBeenCalledWith("org-1", "openai");
    expect(resolved.credentialSource).toBe("org");
    expect(resolved.model).toEqual({
      id: "openai/gpt-4o-mini",
      apiKey: "sk-org-openai",
    });
  });

  it("falls back to env when Vault has no key", async () => {
    process.env.OPENAI_API_KEY = "sk-env-openai";

    const resolved = await resolvePlannerModel(
      "org-1",
      { resolveLlmApiKey: vi.fn(async () => null) },
      "openai/gpt-4o-mini",
    );

    expect(resolved.credentialSource).toBe("env");
    expect(resolved.model).toEqual({
      id: "openai/gpt-4o-mini",
      apiKey: "sk-env-openai",
    });
  });

  it("passes OPENAI_BASE_URL to OpenAI-compatible config", async () => {
    process.env.OPENAI_BASE_URL = "http://localhost:4000/v1";
    process.env.OPENAI_API_KEY = "sk-local";
    process.env.NODE_ENV = "development";

    const resolved = await resolvePlannerModel(
      "org-1",
      { resolveLlmApiKey: vi.fn(async () => null) },
      "openai/playground-gpt-5-mini",
    );

    expect(resolved.model).toEqual({
      providerId: "openai",
      modelId: "playground-gpt-5-mini",
      apiKey: "sk-local",
      url: "http://localhost:4000/v1",
    });
  });

  it("returns router model string when no credentials are available", async () => {
    const resolved = await resolvePlannerModel(
      "org-1",
      { resolveLlmApiKey: vi.fn(async () => null) },
      "openai/gpt-4o-mini",
    );

    expect(resolved.credentialSource).toBe("router");
    expect(resolved.model).toBe("openai/gpt-4o-mini");
  });
});
