import { RICH_TEXT_BLOCK_NODES, RICH_TEXT_INLINE_NODES, RICH_TEXT_MARKS } from "./richtext";

export interface RichTextConstraints {
  allowedNodeTypes: string[];
  allowedMarks: string[];
}

export function parseRichTextConstraints(
  constraints?: Record<string, unknown>,
): RichTextConstraints {
  const allowedNodeTypes = parseStringList(constraints?.allowedNodeTypes);
  const allowedMarks = parseStringList(constraints?.allowedMarks);
  return { allowedNodeTypes, allowedMarks };
}

export function allowsRichTextNode(rules: RichTextConstraints, nodeType: string): boolean {
  if (rules.allowedNodeTypes.length === 0) {
    return (
      (RICH_TEXT_BLOCK_NODES as readonly string[]).includes(nodeType) ||
      (RICH_TEXT_INLINE_NODES as readonly string[]).includes(nodeType)
    );
  }
  return rules.allowedNodeTypes.includes(nodeType);
}

export function allowsRichTextMark(rules: RichTextConstraints, mark: string): boolean {
  if (rules.allowedMarks.length === 0) {
    return (RICH_TEXT_MARKS as readonly string[]).includes(mark);
  }
  return rules.allowedMarks.includes(mark);
}

/** Toolbar capability flags derived from schema constraints. */
export function richTextToolbarFlags(rules: RichTextConstraints) {
  return {
    bold: allowsRichTextMark(rules, "bold"),
    italic: allowsRichTextMark(rules, "italic"),
    underline: allowsRichTextMark(rules, "underline"),
    link: allowsRichTextNode(rules, "hyperlink"),
    heading: allowsRichTextNode(rules, "heading-2"),
    bulletList: allowsRichTextNode(rules, "unordered-list"),
    orderedList: allowsRichTextNode(rules, "ordered-list"),
    blockquote: allowsRichTextNode(rules, "blockquote"),
    codeBlock: allowsRichTextNode(rules, "code-block"),
    hr: allowsRichTextNode(rules, "hr"),
    table: allowsRichTextNode(rules, "table"),
    assetBlock: allowsRichTextNode(rules, "embedded-asset-block"),
    assetInline: allowsRichTextNode(rules, "embedded-asset-inline"),
    entryBlock: allowsRichTextNode(rules, "embedded-entry-block"),
    entryInline: allowsRichTextNode(rules, "embedded-entry-inline"),
    videoBlock: allowsRichTextNode(rules, "embedded-video-block"),
  };
}

function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.length > 0);
}
