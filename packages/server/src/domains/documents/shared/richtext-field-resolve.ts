import {
  applyRichTextEmbedResolution,
  collectRichTextEmbedIds,
  isRichTextDocument,
  type RichTextDocument,
} from "@noname/documents";
import type { AssetDTO, DocumentStorage } from "../ports";
import { resolveDocumentRefs } from "../refs/resolve";
import { DEFAULT_DEFAULT_LOCALE } from "../services/constants";

type GetAsset = (orgId: string, documentId: string) => Promise<AssetDTO | null>;

export async function resolveRichTextFieldValue(
  value: unknown,
  orgId: string,
  locale: string,
  storage: DocumentStorage,
  getAsset: GetAsset,
): Promise<unknown> {
  if (!isRichTextDocument(value)) return value;

  const ids = new Set<string>();
  collectRichTextEmbedIds(value.content, ids);
  if (ids.size === 0) return value;

  const ts = await storage.getTenantSettings(orgId);
  const defaultLocale = ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE;
  const resolved = await resolveDocumentRefs(
    storage,
    orgId,
    [...ids],
    locale,
    defaultLocale,
    getAsset,
  );

  const lookup: Record<string, { label: string; imageUrl: string | null } | null> = {};
  for (const [id, hit] of Object.entries(resolved)) {
    lookup[id] = hit ? { label: hit.label, imageUrl: hit.imageUrl } : null;
  }

  const content = applyRichTextEmbedResolution(value.content, lookup) ?? value.content;
  return { ...value, content } satisfies RichTextDocument;
}

export async function resolveRichTextFieldsInRecord(
  data: Record<string, unknown>,
  fieldTypes: Map<string, string>,
  orgId: string,
  locale: string,
  storage: DocumentStorage,
  getAsset: GetAsset,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...data };
  for (const [key, type] of fieldTypes) {
    if (type !== "richText" || out[key] === undefined) continue;
    out[key] = await resolveRichTextFieldValue(out[key], orgId, locale, storage, getAsset);
  }
  return out;
}

/** Walk nested rich text trees (e.g. after pickLocalizedValue). */
export function isRichTextNodeTree(value: unknown): value is RichTextDocument {
  return isRichTextDocument(value);
}
