import { afterEach, describe, expect, it, vi } from "vitest";
import { resolvePlannerModel } from "./resolve-planner-model";

describe("resolvePlannerModel", () => {
  afterEach(() => {
    delete process.env.MASTRA_PLANNER_MODEL;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("uses org Vault key for the requested provider in the model id", async () => {
    const resolveLlmApiKey = vi.fn(async () => ({
      provider: "openai" as const,
      apiKey: "sk-org-openai",
      source: "org" as const,
    }));

    const resolved = await resolvePlannerModel(
      "org-1",
      { resolveLlmApiKey },
      "openai/gpt-4o-mini",
    );

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
