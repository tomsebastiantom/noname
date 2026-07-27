import { describe, expect, it } from "vitest";
import type { ContentDocumentService, DocumentDTO } from "../../ports";
import { DEFAULT_TENANT_AUTH } from "../../tenant/auth-config";
import { listPublishedCustomAuthProviders, resolveLoginProviders } from "./runtime";

function authProviderRow(
  overrides: Partial<DocumentDTO> & Pick<DocumentDTO, "id" | "status" | "data">,
): DocumentDTO {
  return {
    orgId: "org-1",
    type: "auth_provider",
    key: overrides.id,
    version: 1,
    segment: "default",
    baseVersion: null,
    meta: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("listPublishedCustomAuthProviders", () => {
  it("reads enabled custom providers from published documents", async () => {
    const content: Pick<ContentDocumentService, "findByType"> = {
      findByType: async () => [
        authProviderRow({
          id: "doc-1",
          status: "published",
          data: {
            name: "Okta",
            provider_key: "okta",
            client_id: "cid",
            client_secret: "sec",
            authorization_endpoint: "https://example.com/auth",
            token_endpoint: "https://example.com/token",
            user_endpoint: "https://example.com/userinfo",
            enabled: true,
            icon: { documentId: "icon-1" },
          },
        }),
        authProviderRow({
          id: "doc-2",
          status: "draft",
          data: {
            name: "Draft",
            provider_key: "draft",
            client_id: "cid",
            client_secret: "sec",
            authorization_endpoint: "https://example.com/auth",
            token_endpoint: "https://example.com/token",
            user_endpoint: "https://example.com/userinfo",
          },
        }),
      ],
    };

    const providers = await listPublishedCustomAuthProviders(content, "org-1");
    expect(providers).toEqual([
      {
        providerId: "custom:okta",
        name: "Okta",
        iconDocumentId: "icon-1",
        enabled: true,
      },
    ]);
  });
});

describe("resolveLoginProviders", () => {
  it("merges built-in settings with published custom providers", () => {
    const auth = {
      ...DEFAULT_TENANT_AUTH,
      providers: ["google", "custom:okta"],
      idpIds: { google: "idp-google", "custom:okta": "idp-okta" },
    };

    expect(
      resolveLoginProviders(auth, [
        {
          providerId: "custom:okta",
          name: "Okta",
          iconDocumentId: null,
          enabled: true,
        },
      ]),
    ).toEqual(["google", "custom:okta"]);
  });
});
