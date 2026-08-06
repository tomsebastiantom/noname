import type { RichTextDocument, RichTextMarkType, RichTextNode } from "@noname/documents";

export type RichTextEditorBlock =
  | {
      id: string;
      type: "paragraph";
      text: string;
      marks: RichTextMarkType[];
    }
  | {
      id: string;
      type: "heading-2" | "heading-3";
      text: string;
    }
  | {
      id: string;
      type: "unordered-list";
      items: string[];
    };

let blockSeq = 0;

function nextBlockId(): string {
  blockSeq += 1;
  return `block-${blockSeq}`;
}

export function resetRichTextEditorBlockIdsForTests(): void {
  blockSeq = 0;
}

function textMarks(node: RichTextNode | undefined): RichTextMarkType[] {
  if (!node?.marks?.length) return [];
  return node.marks.map((m) => m.type as RichTextMarkType);
}

function paragraphText(node: RichTextNode): string {
  if (node.nodeType === "text") return node.value ?? "";
  if (!node.content) return "";
  return node.content
    .filter((c) => c.nodeType === "text")
    .map((c) => c.value ?? "")
    .join("");
}

export function richTextDocumentToEditorBlocks(doc: RichTextDocument): RichTextEditorBlock[] {
  const blocks: RichTextEditorBlock[] = [];
  for (const node of doc.content) {
    if (node.nodeType === "paragraph") {
      const textNode = node.content?.find((c) => c.nodeType === "text");
      blocks.push({
        id: nextBlockId(),
        type: "paragraph",
        text: paragraphText(node),
        marks: textMarks(textNode),
      });
      continue;
    }
    if (node.nodeType === "heading-2" || node.nodeType === "heading-3") {
      blocks.push({
        id: nextBlockId(),
        type: node.nodeType,
        text: paragraphText(node),
      });
      continue;
    }
    if (node.nodeType === "unordered-list") {
      const items =
        node.content
          ?.filter((c) => c.nodeType === "list-item")
          .map((item) => paragraphText(item)) ?? [];
      blocks.push({
        id: nextBlockId(),
        type: "unordered-list",
        items: items.length > 0 ? items : [""],
      });
    }
  }
  if (blocks.length === 0) {
    blocks.push({ id: nextBlockId(), type: "paragraph", text: "", marks: [] });
  }
  return blocks;
}

function textNode(text: string, marks: RichTextMarkType[]): RichTextNode {
  return {
    nodeType: "text",
    value: text,
    marks: marks.map((type) => ({ type })),
  };
}

export function editorBlocksToRichTextDocument(blocks: RichTextEditorBlock[]): RichTextDocument {
  const content: RichTextNode[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      content.push({
        nodeType: "paragraph",
        content: [textNode(block.text, block.marks)],
      });
      continue;
    }
    if (block.type === "heading-2" || block.type === "heading-3") {
      content.push({
        nodeType: block.type,
        content: [textNode(block.text, [])],
      });
      continue;
    }
    if (block.type === "unordered-list") {
      const items = block.items.filter((item) => item.trim() !== "");
      content.push({
        nodeType: "unordered-list",
        content: (items.length > 0 ? items : [""]).map((item) => ({
          nodeType: "list-item",
          content: [textNode(item, [])],
        })),
      });
    }
  }
  if (content.length === 0) {
    content.push({ nodeType: "paragraph", content: [textNode("", [])] });
  }
  return { nodeType: "document", content };
}
