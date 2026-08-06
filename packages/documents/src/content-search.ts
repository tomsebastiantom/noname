import { coerceScalarString } from "@noname/shared";
import { isRichTextDocument, parseRichTextFieldValue, richTextToPlainText } from "./richtext";
import type { ContentTypeSchema, FieldType } from "./schema";

const SEARCHABLE_FIELD_TYPES = new Set<FieldType>(["text", "longText", "richText"]);

export function isSearchableContentField(type: FieldType): boolean {
  return SEARCHABLE_FIELD_TYPES.has(type);
}

function plainTextFromRichTextValue(value: unknown): string {
  if (isRichTextDocument(value)) return richTextToPlainText(value);
  if (typeof value === "string") {
    const parsed = parseRichTextFieldValue(value);
    return parsed ? richTextToPlainText(parsed) : "";
  }
  return "";
}

function plainTextFromFieldValue(fieldType: FieldType, value: unknown): string {
  if (value === undefined || value === null) return "";
  if (fieldType === "richText") return plainTextFromRichTextValue(value);
  if (fieldType === "text" || fieldType === "longText") return coerceScalarString(value).trim();
  return "";
}

function localizedPlainTextParts(fieldType: FieldType, value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const parts: string[] = [];
  for (const locValue of Object.values(value as Record<string, unknown>)) {
    const text = plainTextFromFieldValue(fieldType, locValue);
    if (text) parts.push(text);
  }
  return parts;
}

/** Flatten searchable field values into one normalized plain-text blob for indexing. */
export function buildContentSearchText(
  schema: ContentTypeSchema,
  data: Record<string, unknown>,
): string {
  const parts: string[] = [];

  for (const field of schema.fields) {
    if (!isSearchableContentField(field.type)) continue;
    const value = data[field.key];
    if (value === undefined || value === null) continue;

    if (field.isLocalizable) {
      parts.push(...localizedPlainTextParts(field.type, value));
      continue;
    }

    const text = plainTextFromFieldValue(field.type, value);
    if (text) parts.push(text);
  }

  return normalizeSearchText(parts.join(" "));
}

export function normalizeSearchText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function contentSearchExcerpt(searchText: string, maxLength = 160): string {
  const trimmed = searchText.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1)}…`;
}
