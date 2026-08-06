import { describe, expect, it } from "vitest";
import {
  buildContentSearchText,
  contentSearchExcerpt,
  isSearchableContentField,
} from "./content-search";
import { plainTextToRichTextDocument, serializeRichTextFieldValue } from "./richtext";
import type { ContentTypeSchema } from "./schema";

const schema: ContentTypeSchema = {
  fields: [
    { key: "title", type: "text", required: true, isLocalizable: false, label: "Title" },
    { key: "summary", type: "longText", required: false, isLocalizable: true, label: "Summary" },
    { key: "body", type: "richText", required: false, isLocalizable: true, label: "Body" },
    { key: "price", type: "number", required: false, isLocalizable: false, label: "Price" },
  ],
};

describe("content search indexing", () => {
  it("flags searchable field types", () => {
    expect(isSearchableContentField("richText")).toBe(true);
    expect(isSearchableContentField("number")).toBe(false);
  });

  it("indexes text, longText, and richText including localized values", () => {
    const richDoc = plainTextToRichTextDocument("Comfortable cotton blend");
    const searchText = buildContentSearchText(schema, {
      title: "Organic Tee",
      summary: { "en-US": "Soft everyday shirt" },
      body: {
        "en-US": richDoc,
        "fr-FR": plainTextToRichTextDocument("Coton biologique"),
      },
      price: 29,
    });

    expect(searchText).toContain("Organic Tee");
    expect(searchText).toContain("Soft everyday shirt");
    expect(searchText).toContain("Comfortable cotton blend");
    expect(searchText).toContain("Coton biologique");
    expect(searchText).not.toContain("29");
  });

  it("indexes serialized rich text strings", () => {
    const raw = serializeRichTextFieldValue(plainTextToRichTextDocument("Hello search"));
    const searchText = buildContentSearchText(
      {
        fields: [
          { key: "body", type: "richText", required: false, isLocalizable: false, label: "Body" },
        ],
      },
      { body: raw },
    );
    expect(searchText).toBe("Hello search");
  });

  it("builds excerpts from search text", () => {
    const excerpt = contentSearchExcerpt("a".repeat(200), 160);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThanOrEqual(160);
  });
});
