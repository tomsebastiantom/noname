import { z } from "zod";

/** Block node types allowed in a rich text document. */
export const RICH_TEXT_BLOCK_NODES = [
  "paragraph",
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "heading-5",
  "heading-6",
  "blockquote",
  "unordered-list",
  "ordered-list",
  "list-item",
  "hr",
  "embedded-asset-block",
  "embedded-entry-block",
  "embedded-video-block",
  "code-block",
  "table",
  "table-row",
  "table-cell",
] as const;

export const RICH_TEXT_INLINE_NODES = [
  "text",
  "hyperlink",
  "embedded-asset-inline",
  "embedded-entry-inline",
] as const;

export const RICH_TEXT_MARKS = ["bold", "italic", "underline", "code", "strikethrough"] as const;

export type RichTextMarkType = (typeof RICH_TEXT_MARKS)[number];
export type RichTextBlockNodeType = (typeof RICH_TEXT_BLOCK_NODES)[number];
export type RichTextInlineNodeType = (typeof RICH_TEXT_INLINE_NODES)[number];

const NODE_TYPES = [...RICH_TEXT_BLOCK_NODES, ...RICH_TEXT_INLINE_NODES] as unknown as [
  string,
  ...string[],
];

const MARK_TYPES = RICH_TEXT_MARKS as unknown as [string, ...string[]];

export const richTextMarkSchema = z.object({
  type: z.enum(MARK_TYPES),
});

export const richTextNodeSchema: z.ZodType<RichTextNode> = z.lazy(() =>
  z.object({
    nodeType: z.enum(NODE_TYPES),
    value: z.string().optional(),
    marks: z.array(richTextMarkSchema).optional(),
    data: z.record(z.string(), z.unknown()).optional(),
    content: z.array(richTextNodeSchema).optional(),
  }),
);

export const richTextDocumentSchema = z.object({
  nodeType: z.literal("document"),
  content: z.array(richTextNodeSchema).min(1),
});

export type RichTextMark = z.infer<typeof richTextMarkSchema>;
export type RichTextNode = {
  nodeType: string;
  value?: string;
  marks?: RichTextMark[];
  data?: Record<string, unknown>;
  content?: RichTextNode[];
};
export type RichTextDocument = z.infer<typeof richTextDocumentSchema>;

export function isRichTextDocument(value: unknown): value is RichTextDocument {
  return richTextDocumentSchema.safeParse(value).success;
}

export function emptyRichTextDocument(): RichTextDocument {
  return {
    nodeType: "document",
    content: [paragraphNode("")],
  };
}

export function plainTextToRichTextDocument(text: string): RichTextDocument {
  const trimmed = text.trim();
  if (!trimmed) return emptyRichTextDocument();
  const paragraphs = trimmed.split(/\n{2,}/);
  return {
    nodeType: "document",
    content: paragraphs.map((p) => paragraphNode(p.replace(/\n/g, " "))),
  };
}

export { renderRichTextForEmail, richTextToHtml, richTextToPlainText } from "./richtext-html";

export function parseRichTextFieldValue(raw: string): RichTextDocument | null {
  if (!raw.trim()) return emptyRichTextDocument();
  try {
    const parsed: unknown = JSON.parse(raw);
    return isRichTextDocument(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function serializeRichTextFieldValue(doc: RichTextDocument): string {
  return JSON.stringify(doc);
}

export function richTextDocumentFromUnknown(value: unknown): RichTextDocument {
  if (isRichTextDocument(value)) return value;
  if (typeof value === "string") {
    return parseRichTextFieldValue(value) ?? emptyRichTextDocument();
  }
  return emptyRichTextDocument();
}

function paragraphNode(text: string, marks?: RichTextMark[]): RichTextNode {
  if (!text) {
    return {
      nodeType: "paragraph",
      content: [{ nodeType: "text", value: "", marks: marks ?? [] }],
    };
  }
  return {
    nodeType: "paragraph",
    content: [{ nodeType: "text", value: text, marks: marks ?? [] }],
  };
}
