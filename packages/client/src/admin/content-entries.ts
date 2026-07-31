import { apiFetch, apiFetchDataOptional, apiFetchOptional, apiFetchVoid } from "../lib/api";

export interface ContentFieldSchema {
  key: string;
  type: string;
  required: boolean;
  isLocalizable: boolean;
  label: string;
  /** Target content type for FieldType "reference". */
  references?: string;
}

export interface ContentTypeSchema {
  fields: ContentFieldSchema[];
}

export interface ContentTypeSummary {
  name: string;
  schema: ContentTypeSchema;
}

export interface ContentEntryRow {
  id: string;
  key: string;
  status: string;
  data: Record<string, unknown>;
}

const DEFAULT_LOCALE = "en-US";

export function contentTypeFromPath(pathname: string): string {
  const match = pathname.match(/^\/admin\/content\/?([^/]*)/);
  return match?.[1]?.trim() ?? "";
}

function pickLocalized(value: unknown, locale: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const map = value as Record<string, unknown>;
    if (locale in map) return String(map[locale] ?? "");
    const first = Object.values(map)[0];
    return first !== undefined ? String(first) : "";
  }
  return value !== undefined && value !== null ? String(value) : "";
}

export function entryLabel(
  entry: ContentEntryRow,
  schema: ContentTypeSchema,
  locale: string,
): string {
  const titleField = schema.fields.find((f) => f.key === "title") ?? schema.fields[0];
  if (!titleField) return entry.key;
  const raw = entry.data[titleField.key];
  if (titleField.isLocalizable) return pickLocalized(raw, locale) || entry.key;
  return raw !== undefined && raw !== null ? String(raw) : entry.key;
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
    } else if (field.type === "media") {
      if (raw === "") continue;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        parsed = { documentId: raw };
      }
    } else if (field.type === "reference") {
      if (raw === "") continue;
      try {
        parsed = JSON.parse(raw) as unknown;
      } catch {
        parsed = { documentId: raw };
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
    type === "number" ||
    type === "boolean" ||
    type === "media" ||
    type === "reference"
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
}): Promise<void> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const headers = { "Content-Type": "application/json" };
  const { localizable, global } = splitSavePayload(input.values, input.schema);

  if (Object.keys(localizable).length > 0) {
    await apiFetchVoid(
      `/api/documents/${encodeURIComponent(input.contentType)}/${input.id}?locale=${encodeURIComponent(locale)}`,
      { method: "PUT", headers, body: JSON.stringify(localizable) },
    );
  }

  if (Object.keys(global).length > 0) {
    await apiFetchVoid(`/api/documents/${encodeURIComponent(input.contentType)}/${input.id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(global),
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
}): Promise<string> {
  const locale = input.locale ?? DEFAULT_LOCALE;
  const headers = { "Content-Type": "application/json" };
  const { localizable, global } = splitSavePayload(input.values, input.schema);
  const body = { ...global, ...localizable };

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
    fileName: String(data.fileName ?? row.key),
    mimeType: String(data.mimeType ?? ""),
    url: assetUrlFromData(data),
  };
}

function assetUrlFromData(data: Record<string, unknown>): string | null {
  const original = data.original as { url?: string } | undefined;
  if (typeof original?.url === "string" && original.url.trim() !== "") return original.url;
  const variants = data.variants as Record<string, { url?: string }> | undefined;
  const variantUrl = variants?.original?.url;
  return typeof variantUrl === "string" && variantUrl.trim() !== "" ? variantUrl : null;
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
