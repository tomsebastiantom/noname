import {
  isRichTextDocument,
  parseRichTextFieldValue,
  type RichTextDocument,
} from "@noname/documents";

export function parseAgentRichTextFieldValue(value: unknown): RichTextDocument | null {
  if (isRichTextDocument(value)) return value;
  if (typeof value === "string") {
    return parseRichTextFieldValue(value);
  }
  return null;
}
