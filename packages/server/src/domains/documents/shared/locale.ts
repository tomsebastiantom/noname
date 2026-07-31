import type { ContentTypeSchema, DocumentStorage } from "../ports";
import { DEFAULT_DEFAULT_LOCALE, DEFAULT_LOCALES } from "../services/constants";

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
  defaultLocale: string,
): string {
  const titleField =
    schema?.fields.find((f) => f.key === "title") ??
    schema?.fields.find((f) => f.type === "text" || f.type === "longText");
  if (titleField) {
    const raw = data[titleField.key];
    const picked = titleField.isLocalizable ? pickLocalizedValue(raw, locale, defaultLocale) : raw;
    if (picked !== undefined && picked !== null && String(picked).trim() !== "") {
      return String(picked).trim();
    }
  }
  return key;
}

export async function resolveTenantLocales(
  storage: DocumentStorage,
  orgId: string,
): Promise<{ locales: string[]; defaultLocale: string }> {
  const ts = await storage.getTenantSettings(orgId);
  return {
    locales: ts?.locales ?? DEFAULT_LOCALES,
    defaultLocale: ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE,
  };
}
