import {
  embedBlockLabel,
  embeddedAssetBlockNode,
  embeddedAssetInlineNode,
  embeddedEntryBlockNode,
  embeddedEntryInlineNode,
  embeddedVideoBlockNode,
  plainTextToRichTextDocument,
  richTextToPlainText,
  richTextToTipTapJson,
  tipTapJsonToRichText,
} from "@noname/documents";
import { describe, expect, it } from "vitest";

describe("tiptap bridge", () => {
  it("round-trips paragraph and marks", () => {
    const doc = {
      nodeType: "document" as const,
      content: [
        {
          nodeType: "paragraph",
          content: [
            { nodeType: "text", value: "Hello ", marks: [] },
            { nodeType: "text", value: "world", marks: [{ type: "bold" as const }] },
          ],
        },
      ],
    };
    const roundTrip = tipTapJsonToRichText(richTextToTipTapJson(doc));
    expect(richTextToPlainText(roundTrip)).toBe("Hello world");
  });

  it("round-trips embedded asset block", () => {
    const doc = {
      nodeType: "document" as const,
      content: [embeddedAssetBlockNode({ documentId: "asset-1", altText: "Hero" })],
    };
    const roundTrip = tipTapJsonToRichText(richTextToTipTapJson(doc));
    expect(roundTrip.content[0]?.nodeType).toBe("embedded-asset-block");
    expect(embedBlockLabel(roundTrip.content[0]!)).toContain("Hero");
  });

  it("round-trips embedded entry block", () => {
    const doc = {
      nodeType: "document" as const,
      content: [embeddedEntryBlockNode({ documentId: "entry-1", contentType: "callout" })],
    };
    const roundTrip = tipTapJsonToRichText(richTextToTipTapJson(doc));
    expect(roundTrip.content[0]?.nodeType).toBe("embedded-entry-block");
  });

  it("round-trips table block", () => {
    const doc = {
      nodeType: "document" as const,
      content: [
        {
          nodeType: "table",
          content: [
            {
              nodeType: "table-row",
              content: [
                {
                  nodeType: "table-cell",
                  content: [
                    {
                      nodeType: "paragraph",
                      content: [{ nodeType: "text", value: "A1", marks: [] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const roundTrip = tipTapJsonToRichText(richTextToTipTapJson(doc));
    expect(roundTrip.content[0]?.nodeType).toBe("table");
    expect(roundTrip.content[0]?.content?.[0]?.nodeType).toBe("table-row");
  });

  it("round-trips video and inline embeds", () => {
    const doc = {
      nodeType: "document" as const,
      content: [
        {
          nodeType: "paragraph",
          content: [
            embeddedAssetInlineNode({ documentId: "asset-inline", altText: "Icon" }),
            embeddedEntryInlineNode({ documentId: "entry-inline", contentType: "tag" }),
          ],
        },
        embeddedVideoBlockNode({ documentId: "video-1", caption: "Demo" }),
      ],
    };
    const roundTrip = tipTapJsonToRichText(richTextToTipTapJson(doc));
    expect(roundTrip.content[0]?.content?.[0]?.nodeType).toBe("embedded-asset-inline");
    expect(roundTrip.content[0]?.content?.[1]?.nodeType).toBe("embedded-entry-inline");
    expect(roundTrip.content[1]?.nodeType).toBe("embedded-video-block");
  });

  it("round-trips plain seed document helper", () => {
    const doc = plainTextToRichTextDocument("Product copy");
    const roundTrip = tipTapJsonToRichText(richTextToTipTapJson(doc));
    expect(richTextToPlainText(roundTrip)).toBe("Product copy");
  });
});
