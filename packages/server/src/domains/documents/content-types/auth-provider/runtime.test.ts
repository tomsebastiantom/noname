import { describe, expect, it } from "vitest";
import { DEFAULT_TENANT_AUTH } from "../..";
import type { ContentDocumentService, DocumentDTO } from "../../ports";
import {
  listPublishedAuthProviders,
  listPublishedCustomAuthProviders,
  resolveLoginProviders,
} from "./runtime";

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

describe("listPublishedAuthProviders", () => {
  it("reads built-in and custom providers from published documents", async () => {
    const content: Pick<ContentDocumentService, "findByType"> = {
      findByType: async () => [
        authProviderRow({
          id: "doc-google",
          status: "published",
          data: {
            name: "Google",
            provider_key: "google",
            enabled: true,
            icon: { documentId: "icon-google" },
          },
        }),
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

    const providers = await listPublishedAuthProviders(content, "org-1");
    expect(providers).toEqual([
      {
        providerId: "google",
        name: "Google",
        iconDocumentId: "icon-google",
        enabled: true,
      },
      {
        providerId: "custom:okta",
        name: "Okta",
        iconDocumentId: "icon-1",
        enabled: true,
      },
    ]);
  });
});

describe("listPublishedCustomAuthProviders", () => {
  it("excludes built-in rows", async () => {
    const content: Pick<ContentDocumentService, "findByType"> = {
      findByType: async () => [
        authProviderRow({
          id: "doc-google",
          status: "published",
          data: { name: "Google", provider_key: "google", enabled: true },
        }),
      ],
    };

    expect(await listPublishedCustomAuthProviders(content, "org-1")).toEqual([]);
  });
});

describe("resolveLoginProviders", () => {
  it("returns enabled published providers that have ZITADEL idp ids", () => {
    const auth = {
      ...DEFAULT_TENANT_AUTH,
      idpIds: { google: "idp-google", "custom:okta": "idp-okta" },
    };

    expect(
      resolveLoginProviders(auth, [
        {
          providerId: "google",
          name: "Google",
          iconDocumentId: "icon-google",
          enabled: true,
        },
        {
          providerId: "github",
          name: "GitHub",
          iconDocumentId: null,
          enabled: true,
        },
        {
          providerId: "custom:okta",
          name: "Okta",
          iconDocumentId: null,
          enabled: false,
        },
      ]),
    ).toEqual(["google"]);
  });
});
