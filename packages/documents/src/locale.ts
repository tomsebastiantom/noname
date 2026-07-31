import { coerceScalarString } from "@noname/shared";
import type { ContentTypeSchema } from "./schema";

export const DEFAULT_CONTENT_LOCALE = "en-US";

/** Resolve a field value from a locale map (locale → defaultLocale → first value). */
export function pickLocalizedValue(value: unknown, locale: string, defaultLocale: string): unknown {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const map = value as Record<string, unknown>;
    if (locale in map) return map[locale];
    if (defaultLocale in map) return map[defaultLocale];
    return Object.values(map)[0];
  }
  return value;
}

/** Display label for a content row — title field, else first text field, else document key. */
export function labelFromContentData(
  schema: ContentTypeSchema | null,
  data: Record<string, unknown>,
  key: string,
  locale: string,
  defaultLocale: string = DEFAULT_CONTENT_LOCALE,
): string {
  const titleField =
    schema?.fields.find((f) => f.key === "title") ??
    schema?.fields.find((f) => f.type === "text" || f.type === "longText");
  if (titleField) {
    const raw = data[titleField.key];
    const picked = titleField.isLocalizable ? pickLocalizedValue(raw, locale, defaultLocale) : raw;
    const label = coerceScalarString(picked).trim();
    if (label !== "") return label;
  }
  return key;
}

/** Convenience for admin list rows ({ id, key, data }). */
export function entryLabel(
  entry: { key: string; data: Record<string, unknown> },
  schema: ContentTypeSchema,
  locale: string,
  defaultLocale: string = DEFAULT_CONTENT_LOCALE,
): string {
  return labelFromContentData(schema, entry.data, entry.key, locale, defaultLocale);
}
