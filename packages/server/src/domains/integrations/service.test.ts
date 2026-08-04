import { describe, expect, it, vi } from "vitest";
import type { TenantSettingsService } from "../documents/ports";
import { defaultTenantSettings } from "../documents/services/tenant-defaults";
import type { SecretsService } from "../secrets/ports";
import { createIntegrationsService } from "./service";

function mockTenantSettings(integrations: Record<string, unknown> = {}): TenantSettingsService {
  const row = {
    id: "ts-1",
    orgId: "org-1",
    ...defaultTenantSettings(),
    integrations: integrations as never,
  };
  return {
    get: vi.fn(async () => row),
    upsert: vi.fn(async (_orgId, patch) => ({
      ...row,
      ...patch,
      integrations: patch.integrations ?? row.integrations,
    })),
    resolveStoreSlug: vi.fn(async () => "org-1"),
  };
}

function mockSecrets(overrides: Partial<SecretsService> = {}): SecretsService {
  return {
    resolveLLMProvider: vi.fn(),
    resolveCommsCredentials: vi.fn(async () => null),
    putOrgSecret: vi.fn(),
    hasOrgSecret: vi.fn(async () => false),
    ...overrides,
  };
}

describe("createIntegrationsService", () => {
  it("getLlmConfig derives hasOrgKey from secrets", async () => {
    const service = createIntegrationsService({
      secrets: mockSecrets({
        hasOrgSecret: vi.fn(async (_orgId, _kind, provider) => provider === "openai"),
      }),
      tenantSettings: mockTenantSettings({ llm: { provider: "openai" } }),
    });

    const config = await service.getLlmConfig("org-1");
    expect(config).toEqual({
      provider: "openai",
      hasOrgKey: true,
      allowPlatformFallback: true,
    });
  });

  it("updateLlmConfig writes Vault and updates tenant_settings flags only", async () => {
    const putOrgSecret = vi.fn();
    const upsert = vi.fn(async (_orgId, patch) => patch);
    const tenantSettings = mockTenantSettings();
    tenantSettings.upsert = upsert;

    const service = createIntegrationsService({
      secrets: mockSecrets({ putOrgSecret, hasOrgSecret: vi.fn(async () => true) }),
      tenantSettings,
    });

    await service.updateLlmConfig("org-1", "user-1", {
      provider: "anthropic",
      apiKey: " sk-secret ",
      allowPlatformFallback: false,
    });

    expect(putOrgSecret).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        kind: "llm",
        provider: "anthropic",
        payload: expect.objectContaining({ apiKey: "sk-secret", updatedBy: "user-1" }),
      }),
    );
    expect(upsert).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        integrations: expect.objectContaining({
          llm: { provider: "anthropic", allowPlatformFallback: false },
        }),
      }),
    );
  });
});
