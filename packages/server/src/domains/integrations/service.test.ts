import { describe, expect, it, vi } from "vitest";
import type { TenantSettingsService } from "../documents/ports";
import { defaultTenantSettings } from "../documents/services/tenant-defaults";
import type { SecretsService } from "../secrets/ports";
import type { IntegrationOAuthPort } from "./ports";
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
    resolveLlmApiKey: vi.fn(async () => null),
    resolveCommsCredentials: vi.fn(async () => null),
    putOrgSecret: vi.fn(),
    hasOrgSecret: vi.fn(async () => false),
    getOrgSecret: vi.fn(async () => null),
    ...overrides,
  };
}

function mockOAuth(overrides: Partial<IntegrationOAuthPort> = {}): IntegrationOAuthPort {
  return {
    isConfigured: () => true,
    listIntegrations: vi.fn(async () => [
      {
        integrationId: "stripe",
        displayName: "Stripe",
        provider: "stripe",
      },
      {
        integrationId: "slack",
        displayName: "Slack",
        provider: "slack",
      },
    ]),
    createConnectSession: vi.fn(async () => ({
      token: "tok",
      connectLink: "http://localhost:3009/connect",
      expiresAt: new Date().toISOString(),
    })),
    verifyWebhook: vi.fn(() => true),
    triggerAction: vi.fn(async () => ({ ok: true })),
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

  it("getOAuthConnections merges Nango catalog with stored pointers", async () => {
    const service = createIntegrationsService({
      secrets: mockSecrets(),
      tenantSettings: mockTenantSettings({
        nango: { stripe: { connectionId: "conn-stripe" } },
      }),
      oauth: mockOAuth(),
    });

    const result = await service.getOAuthConnections("org-1");
    expect(result.oauthConfigured).toBe(true);
    expect(result.connections).toEqual([
      {
        integrationId: "slack",
        displayName: "Slack",
        provider: "slack",
        connected: false,
      },
      {
        integrationId: "stripe",
        displayName: "Stripe",
        provider: "stripe",
        connected: true,
        connectionId: "conn-stripe",
      },
    ]);
  });

  it("getOAuthConnections reads legacy stripe field when nango map is empty", async () => {
    const service = createIntegrationsService({
      secrets: mockSecrets(),
      tenantSettings: mockTenantSettings({
        stripe: { connectionId: "conn-legacy" },
      }),
      oauth: mockOAuth({
        listIntegrations: vi.fn(async () => [
          { integrationId: "stripe", displayName: "Stripe", provider: "stripe" },
        ]),
      }),
    });

    const result = await service.getOAuthConnections("org-1");
    expect(result.connections[0]).toMatchObject({
      integrationId: "stripe",
      connected: true,
      connectionId: "conn-legacy",
    });
  });

  it("handleOAuthWebhook saves connectionId into integrations.nango map", async () => {
    const upsert = vi.fn(async (_orgId, patch) => patch);
    const tenantSettings = mockTenantSettings();
    tenantSettings.upsert = upsert;

    const service = createIntegrationsService({
      secrets: mockSecrets(),
      tenantSettings,
      oauth: mockOAuth(),
    });

    await service.handleOAuthWebhook({
      type: "auth",
      operation: "creation",
      success: true,
      connectionId: "conn-123",
      providerConfigKey: "hubspot",
      tags: { organization_id: "org-1" },
    });

    expect(upsert).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        integrations: expect.objectContaining({
          nango: { hubspot: { connectionId: "conn-123" } },
        }),
      }),
    );
  });

  it("createOAuthConnectSession delegates to Nango adapter", async () => {
    const createConnectSession = vi.fn(async () => ({
      token: "session-tok",
      connectLink: "http://localhost:3009/?session_token=session-tok",
      expiresAt: "2026-01-01T00:00:00.000Z",
    }));

    const service = createIntegrationsService({
      secrets: mockSecrets(),
      tenantSettings: mockTenantSettings(),
      oauth: mockOAuth({ createConnectSession }),
    });

    const session = await service.createOAuthConnectSession(
      "org-1",
      "user-1",
      "admin@example.com",
      "slack",
    );

    expect(createConnectSession).toHaveBeenCalledWith({
      orgId: "org-1",
      endUserId: "user-1",
      endUserEmail: "admin@example.com",
      integrationId: "slack",
    });
    expect(session.token).toBe("session-tok");
  });
});
