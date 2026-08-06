import { plainTextToRichTextDocument, richTextToPlainText } from "@noname/documents";
import { describe, expect, it } from "vitest";
import { editorBlocksToRichTextDocument, richTextDocumentToEditorBlocks } from "./editor-blocks";

describe("rich text editor blocks", () => {
  it("round-trips paragraph blocks", () => {
    const doc = plainTextToRichTextDocument("Hello world");
    const blocks = richTextDocumentToEditorBlocks(doc);
    const roundTrip = editorBlocksToRichTextDocument(blocks);
    expect(richTextToPlainText(roundTrip)).toBe("Hello world");
  });
});
