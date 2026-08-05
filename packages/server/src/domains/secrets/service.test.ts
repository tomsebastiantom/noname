import { describe, expect, it, vi } from "vitest";
import type { TenantSettingsService } from "../documents/ports";
import { defaultTenantSettings } from "../documents/services/tenant-defaults";
import type { SecretStorePort } from "./ports";
import { createSecretsService } from "./service";

function mockStore(overrides: Partial<SecretStorePort> = {}): SecretStorePort {
  return {
    putOrgSecret: vi.fn(),
    getOrgSecret: vi.fn(async () => null),
    hasOrgSecret: vi.fn(async () => false),
    getPlatformSecret: vi.fn(async () => null),
    ...overrides,
  };
}

function mockTenantSettings(integrations: Record<string, unknown>): TenantSettingsService {
  return {
    get: vi.fn(async (orgId: string) => ({
      id: "ts-1",
      orgId,
      ...defaultTenantSettings(),
      integrations: integrations as never,
    })),
    upsert: vi.fn(),
    resolveStoreSlug: vi.fn(async () => "demo"),
  };
}

describe("createSecretsService.resolveLLMProvider", () => {
  it("uses org Vault key for preferred provider from tenant settings", async () => {
    const getOrgSecret = vi.fn(async ({ provider }: { provider: string }) =>
      provider === "anthropic" ? { apiKey: "sk-org-anthropic" } : null,
    );
    const service = createSecretsService({
      store: mockStore({ getOrgSecret }),
      tenantSettings: mockTenantSettings({ llm: { provider: "anthropic" } }),
    });

    const provider = await service.resolveLLMProvider("org-1");

    expect(getOrgSecret).toHaveBeenCalledWith({
      orgId: "org-1",
      kind: "llm",
      provider: "anthropic",
    });
    expect(provider).toBeDefined();
  });

  it("falls back to platform Vault key when org has no key", async () => {
    const getPlatformSecret = vi.fn(async (name: string) =>
      name === "openai_api_key" ? "sk-platform-openai" : null,
    );
    const service = createSecretsService({
      store: mockStore({ getPlatformSecret }),
    });

    const provider = await service.resolveLLMProvider("org-1");
    expect(getPlatformSecret).toHaveBeenCalledWith("openai_api_key");
    expect(provider).toBeDefined();
  });

  it("returns mock provider when no keys exist", async () => {
    const service = createSecretsService({ store: mockStore() });
    const provider = await service.resolveLLMProvider("org-1");
    const result = await provider.generate({ prompt: "x", targetType: "layout" });
    expect(result.model).toBe("mock");
  });
});

describe("createSecretsService.resolveLlmApiKey", () => {
  it("returns org key before platform key", async () => {
    const getOrgSecret = vi.fn(async () => ({ apiKey: "sk-org" }));
    const getPlatformSecret = vi.fn(async () => "sk-platform");
    const service = createSecretsService({
      store: mockStore({ getOrgSecret, getPlatformSecret }),
    });

    const resolved = await service.resolveLlmApiKey("org-1", "openai");
    expect(resolved).toEqual({
      provider: "openai",
      apiKey: "sk-org",
      source: "org",
    });
    expect(getPlatformSecret).not.toHaveBeenCalled();
  });

  it("returns platform key when org has no key", async () => {
    const getPlatformSecret = vi.fn(async (name: string) =>
      name === "anthropic_api_key" ? "sk-platform-anthropic" : null,
    );
    const service = createSecretsService({
      store: mockStore({ getPlatformSecret }),
    });

    const resolved = await service.resolveLlmApiKey("org-1", "anthropic");
    expect(resolved).toEqual({
      provider: "anthropic",
      apiKey: "sk-platform-anthropic",
      source: "platform",
    });
  });
});

describe("createSecretsService.resolveLlmApiKey", () => {
  it("returns org key before platform key", async () => {
    const getOrgSecret = vi.fn(async ({ provider }: { provider: string }) =>
      provider === "openai" ? { apiKey: "sk-org-openai" } : null,
    );
    const getPlatformSecret = vi.fn(async () => "sk-platform-openai");

    const service = createSecretsService({
      store: mockStore({ getOrgSecret, getPlatformSecret }),
    });

    const resolved = await service.resolveLlmApiKey("org-1", "openai");
    expect(resolved).toEqual({
      provider: "openai",
      apiKey: "sk-org-openai",
      source: "org",
    });
    expect(getPlatformSecret).not.toHaveBeenCalled();
  });

  it("falls back to platform key when org has no key", async () => {
    const getPlatformSecret = vi.fn(async (name: string) =>
      name === "anthropic_api_key" ? "sk-platform-anthropic" : null,
    );

    const service = createSecretsService({
      store: mockStore({ getPlatformSecret }),
    });

    const resolved = await service.resolveLlmApiKey("org-1", "anthropic");
    expect(resolved).toEqual({
      provider: "anthropic",
      apiKey: "sk-platform-anthropic",
      source: "platform",
    });
  });

  it("returns null when no Vault keys exist", async () => {
    const service = createSecretsService({ store: mockStore() });
    await expect(service.resolveLlmApiKey("org-1", "openai")).resolves.toBeNull();
  });
});

describe("createSecretsService.putOrgSecret", () => {
  it("delegates to store", async () => {
    const putOrgSecret = vi.fn();
    const service = createSecretsService({ store: mockStore({ putOrgSecret }) });

    await service.putOrgSecret({
      orgId: "org-1",
      kind: "llm",
      provider: "openai",
      payload: { apiKey: "sk-test", updatedBy: "user-1" },
      updatedBy: "user-1",
    });

    expect(putOrgSecret).toHaveBeenCalledWith({
      orgId: "org-1",
      kind: "llm",
      provider: "openai",
      payload: { apiKey: "sk-test", updatedBy: "user-1" },
      updatedBy: "user-1",
    });
  });
});
