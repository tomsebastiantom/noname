import type { RichTextDocument, RichTextMark, RichTextNode } from "./richtext";
import {
  embeddedAssetBlockNode,
  embeddedAssetInlineNode,
  embeddedEntryBlockNode,
  embeddedEntryInlineNode,
  embeddedVideoBlockNode,
  parseEmbedTarget,
} from "./richtext-embed";

export type TipTapJsonContent = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: TipTapJsonContent[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
};

const HEADING_MAP: Record<number, string> = {
  1: "heading-1",
  2: "heading-2",
  3: "heading-3",
  4: "heading-4",
  5: "heading-5",
  6: "heading-6",
};

function markTypeFromTipTap(type: string): RichTextMark["type"] | null {
  switch (type) {
    case "bold":
    case "italic":
    case "underline":
    case "code":
      return type;
    case "strike":
      return "strikethrough";
    default:
      return null;
  }
}

function marksFromTipTap(marks: TipTapJsonContent["marks"]): RichTextMark[] {
  if (!marks?.length) return [];
  const out: RichTextMark[] = [];
  for (const mark of marks) {
    if (mark.type === "link") continue;
    const mapped = markTypeFromTipTap(mark.type);
    if (mapped) out.push({ type: mapped });
  }
  return out;
}

function tipTapMarksFromRichText(
  marks: RichTextMark[] | undefined,
  linkHref?: string,
): TipTapJsonContent["marks"] {
  const out: NonNullable<TipTapJsonContent["marks"]> = [];
  for (const mark of marks ?? []) {
    if (mark.type === "strikethrough") out.push({ type: "strike" });
    else out.push({ type: mark.type });
  }
  if (linkHref)
    out.push({
      type: "link",
      attrs: { href: linkHref, target: "_blank", rel: "noopener noreferrer" },
    });
  return out.length > 0 ? out : undefined;
}

function richTextInlineToTipTap(nodes: RichTextNode[] | undefined): TipTapJsonContent[] {
  if (!nodes?.length) return [{ type: "text", text: "" }];
  const out: TipTapJsonContent[] = [];
  for (const node of nodes) {
    if (node.nodeType === "text") {
      out.push({
        type: "text",
        text: node.value ?? "",
        marks: tipTapMarksFromRichText(node.marks),
      });
      continue;
    }
    if (node.nodeType === "hyperlink") {
      const uri = typeof node.data?.uri === "string" ? node.data.uri : "";
      for (const child of node.content ?? []) {
        if (child.nodeType !== "text") continue;
        out.push({
          type: "text",
          text: child.value ?? "",
          marks: tipTapMarksFromRichText(child.marks, uri),
        });
      }
      continue;
    }
    if (node.nodeType === "embedded-asset-inline") {
      const target = parseEmbedTarget(node.data);
      if (target?.type === "asset") {
        out.push({
          type: "embeddedAssetInline",
          attrs: { documentId: target.documentId, altText: target.altText ?? "" },
        });
      }
      continue;
    }
    if (node.nodeType === "embedded-entry-inline") {
      const target = parseEmbedTarget(node.data);
      if (target?.type === "entry") {
        out.push({
          type: "embeddedEntryInline",
          attrs: {
            documentId: target.documentId,
            contentType: target.contentType ?? "",
          },
        });
      }
    }
  }
  return out.length > 0 ? out : [{ type: "text", text: "" }];
}

function tipTapInlineToRichText(inline: TipTapJsonContent[] | undefined): RichTextNode[] {
  if (!inline?.length) return [{ nodeType: "text", value: "", marks: [] }];
  const out: RichTextNode[] = [];
  for (const node of inline) {
    if (node.type === "embeddedAssetInline") {
      if (typeof node.attrs?.documentId === "string") {
        out.push(
          embeddedAssetInlineNode({
            documentId: node.attrs.documentId,
            altText: typeof node.attrs.altText === "string" ? node.attrs.altText : undefined,
          }),
        );
      }
      continue;
    }
    if (node.type === "embeddedEntryInline") {
      if (typeof node.attrs?.documentId === "string") {
        out.push(
          embeddedEntryInlineNode({
            documentId: node.attrs.documentId,
            contentType:
              typeof node.attrs.contentType === "string" ? node.attrs.contentType : "entry",
          }),
        );
      }
      continue;
    }
    if (node.type !== "text") continue;
    const linkMark = node.marks?.find((mark) => mark.type === "link");
    const href =
      linkMark?.attrs && typeof linkMark.attrs.href === "string" ? linkMark.attrs.href : undefined;
    const textNode: RichTextNode = {
      nodeType: "text",
      value: node.text ?? "",
      marks: marksFromTipTap(node.marks),
    };
    if (href) {
      out.push({
        nodeType: "hyperlink",
        data: { uri: href },
        content: [{ nodeType: "text", value: node.text ?? "", marks: marksFromTipTap(node.marks) }],
      });
    } else {
      out.push(textNode);
    }
  }
  return out;
}

function tableCellInline(cell: TipTapJsonContent): TipTapJsonContent[] | undefined {
  const paragraph = cell.content?.find((child) => child.type === "paragraph");
  return paragraph?.content;
}

function richTextTableCellToTipTap(cell: RichTextNode): TipTapJsonContent {
  const paragraph = cell.content?.find((child) => child.nodeType === "paragraph");
  return {
    type: "tableCell",
    content: [{ type: "paragraph", content: richTextInlineToTipTap(paragraph?.content) }],
  };
}

function tipTapTableCellToRichText(cell: TipTapJsonContent): RichTextNode {
  return {
    nodeType: "table-cell",
    content: [{ nodeType: "paragraph", content: tipTapInlineToRichText(tableCellInline(cell)) }],
  };
}

function listItemsFromTipTap(items: TipTapJsonContent[] | undefined): RichTextNode[] {
  return (items ?? [])
    .filter((item) => item.type === "listItem")
    .map((item) => ({
      nodeType: "list-item",
      content: tipTapInlineToRichText(item.content?.flatMap((block) => block.content ?? []) ?? []),
    }));
}

export function richTextToTipTapJson(doc: RichTextDocument): TipTapJsonContent {
  const content: TipTapJsonContent[] = [];

  for (const block of doc.content) {
    switch (block.nodeType) {
      case "paragraph":
        content.push({ type: "paragraph", content: richTextInlineToTipTap(block.content) });
        break;
      case "heading-1":
      case "heading-2":
      case "heading-3":
      case "heading-4":
      case "heading-5":
      case "heading-6": {
        const level = Number(block.nodeType.replace("heading-", ""));
        content.push({
          type: "heading",
          attrs: { level },
          content: richTextInlineToTipTap(block.content),
        });
        break;
      }
      case "blockquote":
        content.push({
          type: "blockquote",
          content: [{ type: "paragraph", content: richTextInlineToTipTap(block.content) }],
        });
        break;
      case "unordered-list":
        content.push({
          type: "bulletList",
          content: (block.content ?? [])
            .filter((item) => item.nodeType === "list-item")
            .map((item) => ({
              type: "listItem",
              content: [{ type: "paragraph", content: richTextInlineToTipTap(item.content) }],
            })),
        });
        break;
      case "ordered-list":
        content.push({
          type: "orderedList",
          content: (block.content ?? [])
            .filter((item) => item.nodeType === "list-item")
            .map((item) => ({
              type: "listItem",
              content: [{ type: "paragraph", content: richTextInlineToTipTap(item.content) }],
            })),
        });
        break;
      case "hr":
        content.push({ type: "horizontalRule" });
        break;
      case "code-block":
        content.push({
          type: "codeBlock",
          content: [
            { type: "text", text: block.content?.map((c) => c.value ?? "").join("") ?? "" },
          ],
        });
        break;
      case "table":
        content.push({
          type: "table",
          content: (block.content ?? [])
            .filter((row) => row.nodeType === "table-row")
            .map((row) => ({
              type: "tableRow",
              content: (row.content ?? [])
                .filter((cell) => cell.nodeType === "table-cell")
                .map((cell) => richTextTableCellToTipTap(cell)),
            })),
        });
        break;
      case "embedded-asset-block": {
        const target = parseEmbedTarget(block.data);
        if (target?.type === "asset") {
          content.push({
            type: "embeddedAssetBlock",
            attrs: { documentId: target.documentId, altText: target.altText ?? "" },
          });
        }
        break;
      }
      case "embedded-entry-block": {
        const target = parseEmbedTarget(block.data);
        if (target?.type === "entry") {
          content.push({
            type: "embeddedEntryBlock",
            attrs: {
              documentId: target.documentId,
              contentType: target.contentType ?? "",
            },
          });
        }
        break;
      }
      case "embedded-video-block": {
        const target = parseEmbedTarget(block.data);
        if (target?.type === "video") {
          content.push({
            type: "embeddedVideoBlock",
            attrs: {
              documentId: target.documentId,
              caption: target.caption ?? "",
            },
          });
        }
        break;
      }
      default:
        content.push({ type: "paragraph", content: richTextInlineToTipTap(block.content) });
    }
  }

  if (content.length === 0) {
    content.push({ type: "paragraph", content: [{ type: "text", text: "" }] });
  }

  return { type: "doc", content };
}

export function tipTapJsonToRichText(json: TipTapJsonContent): RichTextDocument {
  const blocks: RichTextNode[] = [];

  for (const node of json.content ?? []) {
    switch (node.type) {
      case "paragraph":
        blocks.push({ nodeType: "paragraph", content: tipTapInlineToRichText(node.content) });
        break;
      case "heading": {
        const level = typeof node.attrs?.level === "number" ? node.attrs.level : 2;
        blocks.push({
          nodeType: (HEADING_MAP[level] ?? "heading-2") as RichTextNode["nodeType"],
          content: tipTapInlineToRichText(node.content),
        });
        break;
      }
      case "blockquote": {
        const paragraph = node.content?.find((child) => child.type === "paragraph");
        blocks.push({
          nodeType: "blockquote",
          content: tipTapInlineToRichText(paragraph?.content),
        });
        break;
      }
      case "bulletList":
        blocks.push({ nodeType: "unordered-list", content: listItemsFromTipTap(node.content) });
        break;
      case "orderedList":
        blocks.push({ nodeType: "ordered-list", content: listItemsFromTipTap(node.content) });
        break;
      case "horizontalRule":
        blocks.push({ nodeType: "hr" });
        break;
      case "codeBlock":
        blocks.push({
          nodeType: "code-block",
          content: [
            {
              nodeType: "text",
              value: node.content?.map((c) => c.text ?? "").join("") ?? "",
              marks: [],
            },
          ],
        });
        break;
      case "table":
        blocks.push({
          nodeType: "table",
          content: (node.content ?? [])
            .filter((row) => row.type === "tableRow")
            .map((row) => ({
              nodeType: "table-row",
              content: (row.content ?? [])
                .filter((cell) => cell.type === "tableCell" || cell.type === "tableHeader")
                .map((cell) => tipTapTableCellToRichText(cell)),
            })),
        });
        break;
      case "embeddedAssetBlock":
        if (typeof node.attrs?.documentId === "string") {
          blocks.push(
            embeddedAssetBlockNode({
              documentId: node.attrs.documentId,
              altText: typeof node.attrs.altText === "string" ? node.attrs.altText : undefined,
            }),
          );
        }
        break;
      case "embeddedEntryBlock":
        if (typeof node.attrs?.documentId === "string") {
          blocks.push(
            embeddedEntryBlockNode({
              documentId: node.attrs.documentId,
              contentType:
                typeof node.attrs.contentType === "string" ? node.attrs.contentType : "entry",
            }),
          );
        }
        break;
      case "embeddedVideoBlock":
        if (typeof node.attrs?.documentId === "string") {
          blocks.push(
            embeddedVideoBlockNode({
              documentId: node.attrs.documentId,
              caption: typeof node.attrs.caption === "string" ? node.attrs.caption : undefined,
            }),
          );
        }
        break;
      default:
        break;
    }
  }

  if (blocks.length === 0) {
    blocks.push({ nodeType: "paragraph", content: [{ nodeType: "text", value: "", marks: [] }] });
  }

  return { nodeType: "document", content: blocks };
}
