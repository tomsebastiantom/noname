import { describe, expect, it } from "vitest";
import {
  emptyRichTextDocument,
  isRichTextDocument,
  parseRichTextFieldValue,
  plainTextToRichTextDocument,
  richTextDocumentFromUnknown,
  richTextToHtml,
  richTextToPlainText,
  serializeRichTextFieldValue,
} from "./richtext";

describe("richtext helpers", () => {
  it("emptyRichTextDocument is valid", () => {
    expect(isRichTextDocument(emptyRichTextDocument())).toBe(true);
  });

  it("plainTextToRichTextDocument wraps text in a paragraph", () => {
    const doc = plainTextToRichTextDocument("Hello world");
    expect(richTextToPlainText(doc)).toBe("Hello world");
  });

  it("round-trips through field serialization", () => {
    const doc = plainTextToRichTextDocument("Line one\n\nLine two");
    const raw = serializeRichTextFieldValue(doc);
    const parsed = parseRichTextFieldValue(raw);
    expect(parsed).not.toBeNull();
    expect(richTextToPlainText(parsed!)).toContain("Line one");
    expect(richTextToPlainText(parsed!)).toContain("Line two");
  });

  it("parseRichTextFieldValue rejects invalid JSON", () => {
    expect(parseRichTextFieldValue("{")).toBeNull();
    expect(parseRichTextFieldValue('"hello"')).toBeNull();
  });

  it("richTextDocumentFromUnknown accepts RichTextDocument JSON only", () => {
    expect(richTextDocumentFromUnknown("plain text")).toEqual(emptyRichTextDocument());
    expect(richTextDocumentFromUnknown(plainTextToRichTextDocument("Hello"))).toEqual(
      plainTextToRichTextDocument("Hello"),
    );
  });

  it("richTextToHtml renders marks and escapes unsafe text", () => {
    const doc = {
      nodeType: "document" as const,
      content: [
        {
          nodeType: "paragraph",
          content: [
            { nodeType: "text", value: "Hello <script>", marks: [{ type: "bold" as const }] },
          ],
        },
        {
          nodeType: "unordered-list",
          content: [
            {
              nodeType: "list-item",
              content: [{ nodeType: "text", value: "Item one", marks: [] }],
            },
          ],
        },
      ],
    };
    const html = richTextToHtml(doc);
    expect(html).toContain("<strong>Hello &lt;script&gt;</strong>");
    expect(html).toContain("<ul><li>Item one</li></ul>");
  });
});
