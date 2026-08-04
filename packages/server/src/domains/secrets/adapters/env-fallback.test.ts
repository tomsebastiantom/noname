import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEnvFallbackSecretStore } from "./env-fallback";

describe("createEnvFallbackSecretStore", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("returns null for org secrets", async () => {
    const store = createEnvFallbackSecretStore();
    const secret = await store.getOrgSecret({ orgId: "o1", kind: "llm", provider: "openai" });
    expect(secret).toBeNull();
  });

  it("reads platform openai key from env", async () => {
    process.env.OPENAI_API_KEY = "sk-env-openai";
    const store = createEnvFallbackSecretStore();
    expect(await store.getPlatformSecret("openai_api_key")).toBe("sk-env-openai");
  });

  it("rejects putOrgSecret", async () => {
    const store = createEnvFallbackSecretStore();
    await expect(
      store.putOrgSecret({
        orgId: "o1",
        kind: "llm",
        provider: "openai",
        payload: { apiKey: "x" },
        updatedBy: "u1",
      }),
    ).rejects.toThrow(/Vault not configured/);
  });
});
