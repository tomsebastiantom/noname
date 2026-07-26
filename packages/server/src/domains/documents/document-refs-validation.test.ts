import { describe, expect, it } from "vitest";
import { ValidationError } from "../../shared/domain-error";
import type { ContentTypeDTO, DocumentDTO, DocumentStorage, TenantSettingsDTO } from "./ports";
import { createDocumentsService } from "./service";

const ORG = "org-1";
const ASSET_ID = "asset-row-1";
const CATEGORY_ID = "cat-row-1";

function documentRow(id: string, type: string, orgId = ORG): DocumentDTO {
  return {
    id,
    orgId,
    type,
    key: id,
    version: 1,
    segment: "default",
    status: "draft",
    baseVersion: null,
    data: {},
    meta: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function mockStorage(docs: Record<string, DocumentDTO>): DocumentStorage {
  const productType: ContentTypeDTO = {
    id: "ct-product",
    orgId: ORG,
    name: "product",
    schema: {
      fields: [
        { key: "title", type: "text", required: true, isLocalizable: false, label: "Title" },
        { key: "hero", type: "media", required: false, isLocalizable: false, label: "Hero" },
        {
          key: "category",
          type: "reference",
          required: false,
          isLocalizable: false,
          label: "Category",
          references: "category",
        },
      ],
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const tenantSettings: TenantSettingsDTO = {
    id: "ts-1",
    orgId: ORG,
    slug: null,
    locales: ["en-US"],
    defaultLocale: "en-US",
    seo: {},
    integrations: {},
    auth: { providers: [], idpIds: {}, allowPassword: true },
  };

  return {
    findContentTypeByName: async (_orgId, name) => (name === "product" ? productType : null),
    getTenantSettings: async () => tenantSettings,
    findDocumentById: async (id) => docs[id] ?? null,
    createDocument: async (input) => ({
      ...documentRow(input.key, input.type, input.orgId),
      data: input.data,
      status: input.status ?? "draft",
    }),
    createContentType: async () => {
      throw new Error("not used");
    },
    findContentTypes: async () => [],
    updateContentType: async () => {
      throw new Error("not used");
    },
    findOrgIdByStoreSlug: async () => null,
    upsertTenantSettings: async () => tenantSettings,
    listDocuments: async () => [],
    findDocument: async () => null,
    updateDocument: async () => {
      throw new Error("not used");
    },
    publishDocument: async () => {
      throw new Error("not used");
    },
    archiveDocument: async () => {
      throw new Error("not used");
    },
    deleteDocument: async () => {},
    findAssetByHash: async () => null,
    findDocumentsWithDataMentioning: async () => [],
  };
}

describe("document ref validation on content save", () => {
  const docs = {
    [ASSET_ID]: documentRow(ASSET_ID, "asset"),
    [CATEGORY_ID]: documentRow(CATEGORY_ID, "category"),
  };

  it("accepts canonical documentId for media and reference fields", async () => {
    const { content } = createDocumentsService(mockStorage(docs));
    const saved = await content.create(ORG, "product", {
      title: "Sneakers",
      hero: { documentId: ASSET_ID },
      category: { documentId: CATEGORY_ID },
    });
    expect(saved.data.hero).toEqual({ documentId: ASSET_ID });
    expect(saved.data.category).toEqual({ documentId: CATEGORY_ID });
  });

  it("accepts legacy assetId on media fields", async () => {
    const { content } = createDocumentsService(mockStorage(docs));
    const saved = await content.create(ORG, "product", {
      title: "Sneakers",
      hero: { assetId: ASSET_ID },
    });
    expect(saved.data.hero).toEqual({ assetId: ASSET_ID });
  });

  it("rejects missing referenced document", async () => {
    const { content } = createDocumentsService(mockStorage(docs));
    await expect(
      content.create(ORG, "product", {
        title: "Sneakers",
        hero: { documentId: "missing-row" },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects wrong document type for field", async () => {
    const { content } = createDocumentsService(mockStorage(docs));
    await expect(
      content.create(ORG, "product", {
        title: "Sneakers",
        hero: { documentId: CATEGORY_ID },
      }),
    ).rejects.toMatchObject({
      details: { field: "hero" },
    });
  });
});

describe("assets.get by document row id", () => {
  it("loads asset when id matches documents row", async () => {
    const asset = documentRow(ASSET_ID, "asset");
    asset.data = {
      storageKey: "org-1/hash/icon.svg",
      fileName: "icon.svg",
      mimeType: "image/svg+xml",
      original: { url: "https://assets.noname.dev/stale/icon.svg", width: null, height: null },
    };
    const { assets } = createDocumentsService(mockStorage({ [ASSET_ID]: asset }));
    const found = await assets.get(ORG, ASSET_ID);
    expect(found?.id).toBe(ASSET_ID);
    expect(found?.data.storageKey).toBe("org-1/hash/icon.svg");
    expect(String((found?.data.original as { url?: string })?.url ?? "")).toContain(
      "org-1/hash/icon.svg",
    );
    expect(String((found?.data.original as { url?: string })?.url ?? "")).not.toContain(
      "assets.noname.dev",
    );
  });

  it("returns null when row is not an asset", async () => {
    const { assets } = createDocumentsService(
      mockStorage({ [CATEGORY_ID]: documentRow(CATEGORY_ID, "category") }),
    );
    expect(await assets.get(ORG, CATEGORY_ID)).toBeNull();
  });
});
