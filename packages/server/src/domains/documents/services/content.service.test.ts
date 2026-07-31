import { describe, expect, it } from "vitest";
import { ValidationError } from "../../../shared/domain-error";
import { createDocumentsService } from "../service";
import { ASSET_ID, CATEGORY_ID, documentRow, mockStorage, ORG } from "../test-helpers";

describe("content.create — document ref validation", () => {
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
