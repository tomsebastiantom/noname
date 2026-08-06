import { plainTextToRichTextDocument, serializeRichTextFieldValue } from "@noname/documents";
import { describe, expect, it } from "vitest";
import { isEditableField, splitSavePayload } from "../documents/content-entries";

describe("content-entries richText", () => {
  const schema = {
    fields: [
      {
        key: "description",
        type: "richText" as const,
        required: false,
        isLocalizable: true,
        label: "Description",
      },
    ],
  };

  it("includes richText in editable fields", () => {
    expect(isEditableField("richText")).toBe(true);
  });

  it("parses richText JSON in splitSavePayload", () => {
    const doc = plainTextToRichTextDocument("Hello");
    const { localizable } = splitSavePayload(
      { description: serializeRichTextFieldValue(doc) },
      schema,
    );
    expect(localizable.description).toEqual(doc);
  });
});
