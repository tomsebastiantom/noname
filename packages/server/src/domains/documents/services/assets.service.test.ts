import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentDTO, DocumentStorage } from "../ports";
import { createDocumentsService } from "../service";
import { documentRow, ORG } from "../test-helpers";

const ASSET_ID = "asset-row-1";
const CATEGORY_ID = "cat-row-1";

function mockAssetsStorage(docs: Record<string, DocumentDTO>): DocumentStorage {
  return {
    findDocumentById: async (id) => docs[id] ?? null,
  } as DocumentStorage;
}

describe("assets.get by document row id", () => {
  beforeEach(() => {
    vi.stubEnv("ASSET_PUBLIC_BASE_URL", "https://cdn.test");
  });

  it("loads asset when id matches documents row", async () => {
    const asset = documentRow(ASSET_ID, "asset");
    asset.data = {
      storageKey: "org-1/hash/icon.svg",
      fileName: "icon.svg",
      mimeType: "image/svg+xml",
      original: { url: "https://assets.noname.dev/stale/icon.svg", width: null, height: null },
    };
    const { assets } = createDocumentsService(mockAssetsStorage({ [ASSET_ID]: asset }));
    const found = await assets.get(ORG, ASSET_ID);
    expect(found?.id).toBe(ASSET_ID);
    expect(found?.data.storageKey).toBe("org-1/hash/icon.svg");
    expect(String((found?.data.original as { url?: string })?.url ?? "")).toContain(
      "org-1/hash/icon.svg",
    );
    expect(String((found?.data.original as { url?: string })?.url ?? "")).not.toContain("/stale/");
  });

  it("returns null when row is not an asset", async () => {
    const { assets } = createDocumentsService(
      mockAssetsStorage({ [CATEGORY_ID]: documentRow(CATEGORY_ID, "category") }),
    );
    expect(await assets.get(ORG, CATEGORY_ID)).toBeNull();
  });
});
