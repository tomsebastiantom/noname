import {
  type ContentTypeSchema,
  DEFAULT_CONTENT_LOCALE,
  emptyRichTextDocument,
  parseRichTextFieldValue,
} from "@noname/documents";
import { coerceScalarString } from "@noname/shared";
import { apiFetch, apiFetchDataOptional, apiFetchOptional, apiFetchVoid } from "../lib/api";
import { assetUrlFromData } from "../lib/asset-url";
import { clientOpHeaders } from "../lib/client-op";

export type { ContentFieldSchema, ContentTypeSchema } from "@noname/documents";
export { documentIdFromFieldValue, entryLabel } from "@noname/documents";

export interface ContentTypeSummary {
  name: string;
  schema: ContentTypeSchema;
}

export interface ContentEntryRow {
  id: string;
  key: string;
  status: string;
  collectionId?: string | null;
  data: Record<string, unknown>;
}

const DEFAULT_LOCALE = DEFAULT_CONTENT_LOCALE;

export function contentTypeFromPath(pathname: string): string {
  const match = pathname.match(/^\/admin\/content\/?([^/]*)/);
  return match?.[1]?.trim() ?? "";
}

export function fieldsFromResolved(resolved: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(resolved)) {
    if (value === null || value === undefined) {
      out[key] = "";
    } else if (typeof value === "object") {
      out[key] = JSON.stringify(value);
    } else {
      out[key] = String(value);
    }
  }
  return out;
}

export function splitSavePayload(
  values: Record<string, string>,
  schema: ContentTypeSchema,
): { localizable: Record<string, unknown>; global: Record<string, unknown> } {
  const localizable: Record<string, unknown> = {};
  const global: Record<string, unknown> = {};

  for (const field of schema.fields) {
    const raw = values[field.key] ?? "";
    if (raw === undefined || raw === "") {
      if (field.required) {
        // keep empty string so API validation can surface errors
      } else {
        continue;
      }
    }

    let parsed: unknown = raw;
    if (field.type === "number") {
      parsed = raw === "" ? 0 : Number(raw);
    } else if (field.type === "boolean") {
      parsed = raw === "true";
    } else if (field.type === "json") {
      if (raw === "") continue;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        parsed = raw;
      }
    } else if (field.type === "media" || field.type === "reference") {
      if (raw === "") continue;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        parsed = { documentId: raw };
      }
    } else if (field.type === "richText") {
      if (raw === "") {
        if (field.required) parsed = emptyRichTextDocument();
        else continue;
      } else {
        parsed = parseRichTextFieldValue(raw) ?? raw;
      }
    }

    if (field.isLocalizable) {
      localizable[field.key] = parsed;
    } else {
      global[field.key] = parsed;
    }
  }

  return { localizable, global };
}

export function isEditableField(type: string): boolean {
  return (
    type === "text" ||
    type === "longText" ||
    type === "richText" ||
    type === "number" ||
    type === "boolean" ||
    type === "media" ||
    type === "reference" ||
    type === "json"
  );
}

export async function listContentTypes(): Promise<ContentTypeSummary[]> {
  const body = await apiFetch<{ data?: ContentTypeSummary[] }>("/api/documents/content-types");
  return body.data ?? [];
}

export async function getContentType(name: string): Promise<ContentTypeSummary | null> {
  return apiFetchDataOptional<ContentTypeSummary>(
    `/api/documents/content-types/${encodeURIComponent(name)}`,
  );
}

export async function listEntries(contentType: string): Promise<ContentEntryRow[]> {
  const body = await apiFetch<{ data?: ContentEntryRow[] }>(
    `/api/documents/${encodeURIComponent(contentType)}`,
  );
  return body.data ?? [];
}

export async function loadEntryFields(
  contentType: string,
  id: string,
  locale = DEFAULT_LOCALE,
): Promise<Record<string, string>> {
  const body = await apiFetch<{ data?: Record<string, unknown> }>(
    `/api/documents/${encodeURIComponent(contentType)}/${id}/resolve?locale=${encodeURIComponent(locale)}`,
  );
  return fieldsFromResolved(body.data ?? {});
}

export async function saveContentEntry(input: {
  contentType: string;
  id: string;
  schema: ContentTypeSchema;
  values: Record<string, string>;
  locale?: string;
  collectionId?: string | null;
}): Promise<void> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const headers = { "Content-Type": "application/json", ...clientOpHeaders() };
  const { localizable, global } = splitSavePayload(input.values, input.schema);

  if (Object.keys(localizable).length > 0) {
    await apiFetchVoid(
      `/api/documents/${encodeURIComponent(input.contentType)}/${input.id}?locale=${encodeURIComponent(locale)}`,
      { method: "PUT", headers, body: JSON.stringify(localizable) },
    );
  }

  const globalBody: Record<string, unknown> = { ...global };
  if (input.collectionId !== undefined) {
    globalBody.collectionId = input.collectionId;
  }

  if (Object.keys(globalBody).length > 0) {
    await apiFetchVoid(`/api/documents/${encodeURIComponent(input.contentType)}/${input.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(globalBody),
    });
  }
}

export async function publishContentEntry(contentType: string, id: string): Promise<void> {
  await apiFetchVoid(`/api/documents/${encodeURIComponent(contentType)}/${id}/publish`, {
    method: "PUT",
  });
}

export async function createContentEntry(input: {
  contentType: string;
  schema: ContentTypeSchema;
  values: Record<string, string>;
  locale?: string;
  collectionId?: string | null;
}): Promise<string> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const headers = { "Content-Type": "application/json" };
  const { localizable, global } = splitSavePayload(input.values, input.schema);
  const body: Record<string, unknown> = { ...global, ...localizable };
  if (input.collectionId !== undefined) {
    body.collectionId = input.collectionId;
  }

  const created = await apiFetch<{ data?: { id: string } }>(
    `/api/documents/${encodeURIComponent(input.contentType)}?locale=${encodeURIComponent(locale)}`,
    { method: "POST", headers, body: JSON.stringify(body) },
  );
  if (!created.data?.id) throw new Error("Create succeeded but no entry id returned");
  return created.data.id;
}

export { DEFAULT_LOCALE as CONTENT_DEFAULT_LOCALE };

export interface AssetSummary {
  id: string;
  fileName: string;
  mimeType: string;
  url: string | null;
}

function assetFromRow(row: {
  id: string;
  key: string;
  data?: Record<string, unknown>;
}): AssetSummary {
  const data = row.data ?? {};
  return {
    id: row.id,
    fileName: coerceScalarString(data.fileName, row.key),
    mimeType: coerceScalarString(data.mimeType),
    url: assetUrlFromData(data),
  };
}

export async function listAssets(): Promise<AssetSummary[]> {
  const body = await apiFetch<{
    data?: { id: string; key: string; data?: Record<string, unknown> }[];
  }>("/api/documents/assets");
  return (body.data ?? []).map((row) => assetFromRow({ ...row, data: row.data ?? {} }));
}

export async function uploadAsset(file: File): Promise<AssetSummary> {
  const form = new FormData();
  form.append("file", file);
  const body = await apiFetch<{
    data?: { id: string; key: string; data?: Record<string, unknown> };
  }>("/api/documents/assets/upload", {
    method: "POST",
    body: form,
  });
  if (!body.data) throw new Error("Upload succeeded but no asset returned");
  return assetFromRow(body.data);
}

export async function getAsset(assetId: string): Promise<AssetSummary | null> {
  const body = await apiFetchOptional<{
    data?: { id: string; key: string; data?: Record<string, unknown> };
  }>(`/api/documents/assets/${encodeURIComponent(assetId)}`);
  if (!body?.data) return null;
  return assetFromRow(body.data);
}

export interface InboundRefHit {
  id: string;
  type: string;
  key: string;
  status: string;
  fieldPath: string;
}

export async function fetchRefBackrefs(documentId: string): Promise<InboundRefHit[]> {
  const body = await apiFetch<{ data?: InboundRefHit[] }>(
    `/api/documents/ref-backrefs?documentId=${encodeURIComponent(documentId)}`,
  );
  return body.data ?? [];
}

export async function deleteContentEntry(contentType: string, id: string): Promise<void> {
  await apiFetchVoid(
    `/api/documents/${encodeURIComponent(contentType)}/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
