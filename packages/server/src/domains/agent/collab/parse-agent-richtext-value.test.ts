import { plainTextToRichTextDocument, richTextToPlainText } from "@noname/documents";
import { describe, expect, it } from "vitest";
import { parseAgentRichTextFieldValue } from "./parse-agent-richtext-value";

describe("parseAgentRichTextFieldValue", () => {
  it("accepts RichTextDocument objects", () => {
    const doc = plainTextToRichTextDocument("Hello agent");
    expect(parseAgentRichTextFieldValue(doc)).toEqual(doc);
  });

  it("parses serialized rich text strings", () => {
    const doc = plainTextToRichTextDocument("Serialized");
    const raw = JSON.stringify(doc);
    const parsed = parseAgentRichTextFieldValue(raw);
    expect(parsed).not.toBeNull();
    expect(richTextToPlainText(parsed!)).toBe("Serialized");
  });

  it("returns null for non-rich-text values", () => {
    expect(parseAgentRichTextFieldValue(42)).toBeNull();
    expect(parseAgentRichTextFieldValue({ title: "plain" })).toBeNull();
  });

  it("uses richTextDocumentFromUnknown for loose objects", () => {
    const doc = plainTextToRichTextDocument("Loose");
    const parsed = parseAgentRichTextFieldValue({ ...doc });
    expect(parsed).not.toBeNull();
    expect(richTextToPlainText(parsed!)).toBe("Loose");
  });
});
