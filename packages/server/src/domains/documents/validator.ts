import { z } from "zod";
import type { ContentTypeSchema, FieldDefinition } from "./ports";
import type { RichTextNode } from "./richtext";
import {
  isRichTextDocument,
  RICH_TEXT_BLOCK_NODES,
  RICH_TEXT_INLINE_NODES,
  RICH_TEXT_MARKS,
} from "./richtext";

const ALL_NODE_TYPES = [...RICH_TEXT_BLOCK_NODES, ...RICH_TEXT_INLINE_NODES] as readonly string[];
const ALL_MARKS = RICH_TEXT_MARKS as readonly string[];

// Real content validator. Generates a Zod schema per field from the content type
// schema and validates a content entry's STORED representation: isLocalizable
// fields are locale-keyed maps ({ "en-US": value }), non-localizable fields are
// plain values. Locale enablement is checked against the tenant's locale list.
//
// Field-in-locale-target rules (non-localizable field written with ?locale, etc.)
// and required-field checks are enforced by the content service, which knows the
// target locale and the tenant's default locale.

function fieldValueSchema(field: FieldDefinition): z.ZodType<unknown> {
  let base: z.ZodType<unknown>;
  switch (field.type) {
    case "text":
    case "longText":
      base = z.string();
      break;
    case "richText": {
      const allowedNodes = parseStringSet(field.constraints?.allowedNodeTypes, ALL_NODE_TYPES);
      const allowedMarks = parseStringSet(field.constraints?.allowedMarks, ALL_MARKS);
      const hasAllowlist = allowedNodes.size > 0 || allowedMarks.size > 0;
      base = hasAllowlist
        ? z.any().refine((v) => isRichTextDocumentWithRestrictions(v, allowedNodes, allowedMarks), {
            message: field.constraints?.allowedNodeTypes
              ? "rich text uses disallowed node types"
              : "rich text uses disallowed marks",
          })
        : z
            .any()
            .refine((v) => isRichTextDocument(v), { message: "value must be a RichTextDocument" });
      break;
    }
    case "number":
      base = z.number();
      break;
    case "boolean":
      base = z.boolean();
      break;
    case "date":
      base = z.string();
      break;
    case "media":
      base = z.object({ assetId: z.string() }).passthrough();
      break;
    case "mediaList":
      base = z.array(z.object({ assetId: z.string() }).passthrough());
      break;
    case "reference":
      base = z.union([z.string(), z.object({ entryId: z.string() }).passthrough()]);
      break;
    case "enum":
      base =
        field.options && field.options.length > 0
          ? z.enum(field.options as [string, ...string[]])
          : z.string();
      break;
    case "json":
      base = z.any();
      break;
    case "array": {
      const itemType = field.items?.type ?? "text";
      const itemSchema = fieldValueSchema({ ...field, type: itemType, isLocalizable: false });
      base = z.array(itemSchema);
      break;
    }
    default:
      base = z.any();
  }
  return base;
}

export const contentValidator = {
  validate(
    schema: ContentTypeSchema | null,
    data: unknown,
    tenantLocales: string[],
  ): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    if (!schema?.fields) {
      // No schema: accept arbitrary data (e.g. content_type/system types).
      return { valid: true };
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { valid: false, errors: ["content data must be an object"] };
    }
    const record = data as Record<string, unknown>;
    const knownKeys = new Set(schema.fields.map((f) => f.key));

    for (const field of schema.fields) {
      const value = record[field.key];
      if (field.isLocalizable) {
        if (value === undefined) continue;
        if (typeof value !== "object" || Array.isArray(value) || value === null) {
          errors.push(`field '${field.key}' is localizable — expected a locale map`);
          continue;
        }
        const localeMap = value as Record<string, unknown>;
        for (const [locale, localValue] of Object.entries(localeMap)) {
          if (!tenantLocales.includes(locale)) {
            errors.push(`locale '${locale}' is not enabled for this tenant`);
            continue;
          }
          const result = fieldValueSchema(field).safeParse(localValue);
          if (!result.success) {
            errors.push(
              `field '${field.key}' (${locale}) is invalid: ${result.error.issues[0]?.message ?? "invalid value"}`,
            );
          }
        }
      } else {
        if (value === undefined) continue;
        const result = fieldValueSchema(field).safeParse(value);
        if (!result.success) {
          errors.push(
            `field '${field.key}' is invalid: ${result.error.issues[0]?.message ?? "invalid value"}`,
          );
        }
      }
    }

    for (const key of Object.keys(record)) {
      if (!knownKeys.has(key)) {
        errors.push(`unknown field '${key}' is not defined in the content type schema`);
      }
    }

    return { valid: errors.length === 0, errors };
  },
};

function parseStringSet(value: unknown, allowed: readonly string[]): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set((value as string[]).filter((v) => typeof v === "string" && allowed.includes(v)));
}

function isRichTextDocumentWithRestrictions(
  value: unknown,
  allowedNodes: Set<string>,
  allowedMarks: Set<string>,
): boolean {
  if (!isRichTextDocument(value)) return false;
  return walkRichTextNodes(value.content as RichTextNode[] | undefined, allowedNodes, allowedMarks);
}

function walkRichTextNodes(
  nodes: RichTextNode[] | undefined,
  allowedNodes: Set<string>,
  allowedMarks: Set<string>,
): boolean {
  if (!nodes) return true;
  for (const node of nodes) {
    if (allowedNodes.size > 0 && !allowedNodes.has(node.nodeType)) return false;
    if (allowedMarks.size > 0 && node.marks) {
      if (node.marks.some((m) => !allowedMarks.has(m.type))) return false;
    }
    if (node.content && !walkRichTextNodes(node.content, allowedNodes, allowedMarks)) return false;
  }
  return true;
}
