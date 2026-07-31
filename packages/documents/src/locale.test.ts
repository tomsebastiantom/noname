import { describe, expect, it } from "vitest";
import { labelFromContentData, pickLocalizedValue } from "./locale";
import type { ContentTypeSchema } from "./schema";

describe("pickLocalizedValue", () => {
  it("prefers requested locale, then default, then first value", () => {
    const map = { "en-US": "Hello", fr: "Bonjour" };
    expect(pickLocalizedValue(map, "fr", "en-US")).toBe("Bonjour");
    expect(pickLocalizedValue(map, "de", "en-US")).toBe("Hello");
    expect(pickLocalizedValue({ es: "Hola" }, "en-US", "fr")).toBe("Hola");
  });

  it("passes through non-localizable scalars", () => {
    expect(pickLocalizedValue("plain", "en-US", "fr")).toBe("plain");
  });
});

describe("labelFromContentData", () => {
  const schema: ContentTypeSchema = {
    fields: [
      { key: "title", type: "text", required: true, isLocalizable: true, label: "Title" },
      { key: "sku", type: "text", required: false, isLocalizable: false, label: "SKU" },
    ],
  };

  it("uses localized title when present", () => {
    expect(
      labelFromContentData(
        schema,
        { title: { "en-US": "Sneakers" }, sku: "ABC" },
        "product-1",
        "en-US",
      ),
    ).toBe("Sneakers");
  });

  it("falls back to document key when title is empty", () => {
    expect(labelFromContentData(schema, { title: { "en-US": "  " } }, "product-1", "en-US")).toBe(
      "product-1",
    );
  });

  it("uses first text field when no title key", () => {
    const noTitle: ContentTypeSchema = {
      fields: [{ key: "sku", type: "text", required: false, isLocalizable: false, label: "SKU" }],
    };
    expect(labelFromContentData(noTitle, { sku: "ABC-123" }, "row-key", "en-US")).toBe("ABC-123");
  });
});
