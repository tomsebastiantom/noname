import { describe, expect, it, vi } from "vitest";
import type { DocumentDTO, DocumentStorage } from "../ports";
import { parseRefIdsParam, resolveDocumentRefs, resolveLabelForRow } from "./resolve";

function row(
  id: string,
  type: string,
  key: string,
  data: Record<string, unknown> = {},
): DocumentDTO {
  return {
    id,
    orgId: "org-1",
    type,
    key,
    version: 1,
    segment: "default",
    status: "published",
    baseVersion: null,
    data,
    meta: {},
    collectionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function mockStorage(docs: Record<string, DocumentDTO>): DocumentStorage {
  return {
    findDocumentById: async (id) => docs[id] ?? null,
    findContentTypeByName: async (_orgId, name) =>
      name === "category"
        ? {
            id: "ct-1",
            orgId: "org-1",
            name: "category",
            schema: {
              fields: [
                {
                  key: "title",
                  type: "text",
                  required: true,
                  isLocalizable: false,
                  label: "Title",
                },
              ],
            },
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        : null,
    createContentType: vi.fn(),
    findContentTypes: vi.fn(),
    updateContentType: vi.fn(),
    getTenantSettings: vi.fn(),
    findOrgIdByStoreSlug: vi.fn(),
    findOrgIdByOAuthConnectionId: vi.fn(),
    upsertTenantSettings: vi.fn(),
    createDocument: vi.fn(),
    listDocuments: vi.fn(),
    findDocument: vi.fn(),
    updateDocument: vi.fn(),
    publishDocument: vi.fn(),
    archiveDocument: vi.fn(),
    deleteDocument: vi.fn(),
    findAssetByHash: vi.fn(),
    findDocumentsWithDataMentioning: vi.fn(async () => []),
    findCollectionSlug: vi.fn(async () => null),
    recordDocumentOp: vi.fn(async () => {}),
  };
}

describe("resolveDocumentRefs", () => {
  it("resolves content entry label from schema title field", async () => {
    const catId = "cat-1";
    const storage = mockStorage({
      [catId]: row(catId, "category", "yoga-mats", { title: "Yoga Mats" }),
    });

    const resolved = await resolveDocumentRefs(
      storage,
      "org-1",
      [catId],
      "en-US",
      "en-US",
      async () => null,
    );

    expect(resolved[catId]).toEqual({
      documentId: catId,
      type: "category",
      key: "yoga-mats",
      status: "published",
      label: "Yoga Mats",
      imageUrl: null,
    });
  });

  it("resolves asset label and imageUrl", async () => {
    const assetId = "asset-1";
    const storage = mockStorage({
      [assetId]: row(assetId, "asset", "icon-key", {
        fileName: "google.svg",
        storageKey: "org-1/hash/google.svg",
        mimeType: "image/svg+xml",
      }),
    });

    const resolved = await resolveDocumentRefs(
      storage,
      "org-1",
      [assetId],
      "en-US",
      "en-US",
      async () => storage.findDocumentById(assetId) as Promise<never>,
    );

    expect(resolved[assetId]?.label).toBe("google.svg");
    expect(resolved[assetId]?.imageUrl).toContain("google.svg");
  });

  it("returns null for missing or wrong-org ids", async () => {
    const storage = mockStorage({});
    const resolved = await resolveDocumentRefs(
      storage,
      "org-1",
      ["missing"],
      "en-US",
      "en-US",
      async () => null,
    );
    expect(resolved.missing).toBeNull();
  });
});

describe("parseRefIdsParam", () => {
  it("parses comma-separated ids with dedupe cap", () => {
    expect(parseRefIdsParam(" a, b ,a")).toEqual(["a", "b"]);
  });
});

describe("resolveLabelForRow", () => {
  it("falls back to document key when no title field", () => {
    expect(resolveLabelForRow(row("x", "page", "home-page", {}), null, "en-US", "en-US")).toBe(
      "home-page",
    );
  });
});
