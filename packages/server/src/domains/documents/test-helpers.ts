import type { ContentTypeDTO, DocumentDTO, DocumentStorage, TenantSettingsDTO } from "./ports";
import { DEFAULT_TENANT_AUTH } from "./tenant/auth-config";

export const ORG = "org-1";
export const ASSET_ID = "asset-row-1";
export const CATEGORY_ID = "cat-row-1";

export function documentRow(id: string, type: string, orgId = ORG): DocumentDTO {
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
    collectionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function mockStorage(docs: Record<string, DocumentDTO>): DocumentStorage {
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
    auth: { ...DEFAULT_TENANT_AUTH },
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
    findOrgIdByOAuthConnectionId: async () => null,
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
    findCollectionSlug: async () => null,
    findCollectionIdBySlug: async () => null,
    recordDocumentOp: async () => ({ serverVersion: 1 }),
  };
}
