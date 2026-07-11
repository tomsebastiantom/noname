import { z } from "zod";

// Rich text — a first-class field type. Content entries with a `richText` field
// store a structured JSON document (not HTML, not Markdown) that surfaces render
// differently per channel (web, mobile, email, API). See design doc.
//
// A rich text document is a tree of block/inline nodes. Every node has a
// `nodeType` and optional `data`. Text-bearing nodes carry an array of `marks`.

export const RICH_TEXT_BLOCK_NODES = [
  "paragraph",
  "heading-1", "heading-2", "heading-3", "heading-4", "heading-5", "heading-6",
  "blockquote",
  "unordered-list", "ordered-list", "list-item",
  "hr",
  "embedded-asset-block",
  "embedded-entry-block",
  "embedded-video-block",
  "code-block",
] as const;

export const RICH_TEXT_INLINE_NODES = [
  "text",
  "hyperlink",
  "embedded-asset-inline",
  "embedded-entry-inline",
] as const;

export const RICH_TEXT_MARKS = [
  "bold", "italic", "underline", "code", "strikethrough",
] as const;

// zod's enum wants a mutable string tuple; the exported `as const` arrays are
// readonly, so cast explicitly here.
const NODE_TYPES = [
  ...RICH_TEXT_BLOCK_NODES,
  ...RICH_TEXT_INLINE_NODES,
] as unknown as [string, ...string[]];

const MARK_TYPES = RICH_TEXT_MARKS as unknown as [string, ...string[]];

export const richTextMarkSchema = z.object({
  type: z.enum(MARK_TYPES),
});

export const richTextNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    nodeType: z.enum(NODE_TYPES),
    value: z.string().optional(),
    marks: z.array(richTextMarkSchema).optional(),
    data: z.record(z.unknown()).optional(),
    content: z.array(richTextNodeSchema).optional(),
  })
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
