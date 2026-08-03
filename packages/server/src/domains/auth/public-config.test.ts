import { describe, expect, it, vi } from "vitest";
import type {
  AssetDocumentService,
  ContentDocumentService,
  TenantSettingsService,
} from "../documents/contracts";
import { createAuthService } from "./service";

describe("auth publicConfig", () => {
  it("merges built-in label and icon from published auth_provider CMS entries", async () => {
    const tenantSettings: TenantSettingsService = {
      get: async () => ({
        id: "settings-1",
        orgId: "org-1",
        slug: "demo",
        locales: ["en-US"],
        defaultLocale: "en-US",
        seo: {},
        integrations: {},
        auth: {
          providers: [],
          idpIds: { google: "idp-google" },
          allowPassword: true,
        },
      }),
      upsert: vi.fn(),
      resolveStoreSlug: async () => "demo",
    };

    const content: Pick<ContentDocumentService, "findByType"> = {
      findByType: async () => [
        {
          id: "doc-google",
          orgId: "org-1",
          type: "auth_provider",
          key: "doc-google",
          status: "published",
          version: 1,
          segment: "default",
          baseVersion: null,
          meta: {},
          collectionId: null,
          data: {
            name: "Sign in with Google",
            provider_key: "google",
            enabled: true,
            icon: { documentId: "icon-google" },
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };

    const assets: AssetDocumentService = {
      get: async (_orgId, id) =>
        id === "icon-google"
          ? {
              id: "icon-google",
              orgId: "org-1",
              type: "asset",
              key: "google.svg",
              status: "published",
              version: 1,
              segment: "default",
              baseVersion: null,
              meta: {},
              collectionId: null,
              data: { storageKey: "org-1/icons/google.svg" },
              createdAt: new Date(),
              updatedAt: new Date(),
            }
          : null,
      create: vi.fn(),
      list: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      delete: vi.fn(),
      publish: vi.fn(),
      findByHash: vi.fn(),
    };

    const service = createAuthService({ tenantSettings, content, assets });
    const config = await service.getConfig("org-1");

    expect(config.providers).toEqual(["google"]);
    expect(config.providerLabels.google).toBe("Continue with Sign in with Google");
    expect(config.providerIcons.google).toBe("https://assets.noname.dev/org-1/icons/google.svg");
  });
});
