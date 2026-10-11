import { plainTextToRichTextDocument } from "@noname/documents";
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

describe("content search indexing", () => {
  const docs = {
    [ASSET_ID]: documentRow(ASSET_ID, "asset"),
    [CATEGORY_ID]: documentRow(CATEGORY_ID, "category"),
  };

  it("stores meta.searchText with rich text plain text on create", async () => {
    const { content } = createDocumentsService(mockStorage(docs));
    const saved = await content.create(ORG, "product", {
      title: "Trail Runner",
      description: plainTextToRichTextDocument("Lightweight mesh upper"),
    });
    expect(saved.meta.searchText).toBe("Trail Runner Lightweight mesh upper");
  });
});

describe("content tenant boundary", () => {
  // Regression: findById ignored its org argument and resolve checked only the
  // type, so any staff user could read another tenant's document by id via
  // GET /api/documents/:type/:id and .../:id/resolve.
  const OWN_ID = "own-product-1";
  const FOREIGN_ID = "foreign-product-1";

  function serviceUnderTest() {
    return createDocumentsService(
      mockStorage({
        [OWN_ID]: documentRow(OWN_ID, "product"),
        [FOREIGN_ID]: documentRow(FOREIGN_ID, "product", "org-other"),
      }),
    );
  }

  it("findById refuses a document owned by a different org", async () => {
    const { content } = serviceUnderTest();
    expect(await content.findById(ORG, FOREIGN_ID)).toBeNull();
  });

  it("resolve refuses a document owned by a different org", async () => {
    const { content } = serviceUnderTest();
    expect(await content.resolve(ORG, "product", FOREIGN_ID, "en-US")).toBeNull();
  });

  it("findById still returns a document owned by the caller org", async () => {
    const { content } = serviceUnderTest();
    const found = await content.findById(ORG, OWN_ID);
    expect(found?.id).toBe(OWN_ID);
  });
});
