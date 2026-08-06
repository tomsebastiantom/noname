import { apiFetch, apiFetchVoid, unwrapData } from "../lib/api";
import { clientOpHeaders } from "../lib/client-op";

export interface LayoutRow {
  id: string;
  key: string;
  segment: string;
  status: string;
  version: number;
  updatedAt: string;
  collectionId?: string | null;
  data: {
    spec?: Record<string, unknown>;
    contentRef?: string | null;
  };
}

export interface LayoutSummary {
  templateName: string;
  segment: string;
  status: string;
  id: string;
  hasContentRef: boolean;
}

export function layoutTemplateFromPath(pathname: string): string {
  const match = pathname.match(/^\/admin\/layout\/?([^/]*)/);
  return match?.[1]?.trim() ?? "";
}

export async function listLayouts(segment = "default"): Promise<LayoutSummary[]> {
  const body = await apiFetch<{ data?: LayoutRow[] }>(
    `/api/documents/layout?segment=${encodeURIComponent(segment)}`,
  );
  const rows = body.data ?? [];

  const byKey = new Map<string, LayoutRow>();
  for (const row of rows) {
    const existing = byKey.get(row.key);
    if (!existing) {
      byKey.set(row.key, row);
      continue;
    }
    if (row.status === "draft" && existing.status !== "draft") {
      byKey.set(row.key, row);
    }
  }

  return [...byKey.values()]
    .map((row) => ({
      templateName: row.key,
      segment: row.segment,
      status: row.status,
      id: row.id,
      hasContentRef: Boolean(row.data.contentRef),
    }))
    .sort((a, b) => a.templateName.localeCompare(b.templateName));
}

export async function getLayoutForTemplate(
  templateName: string,
  segment = "default",
): Promise<LayoutRow | null> {
  const body = await apiFetch<{ data?: LayoutRow[] }>(
    `/api/documents/layout?segment=${encodeURIComponent(segment)}&templateName=${encodeURIComponent(templateName)}`,
  );
  const rows = body.data ?? [];
  const draft = rows.find((r) => r.status === "draft");
  const published = rows.find((r) => r.status === "published");
  return draft ?? published ?? rows[0] ?? null;
}

export function specToJson(spec: Record<string, unknown> | undefined): string {
  return JSON.stringify(spec ?? { root: "", elements: {} }, null, 2);
}

export function parseSpecJson(text: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Layout spec must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

export async function saveLayout(input: {
  id: string;
  spec: Record<string, unknown>;
  contentRef?: string | null;
  collectionId?: string | null;
  ifMatchUpdatedAt?: string;
}): Promise<LayoutRow> {
  const body: {
    spec: Record<string, unknown>;
    contentRef?: string | null;
    collectionId?: string | null;
  } = {
    spec: input.spec,
  };
  if (input.contentRef !== undefined) {
    body.contentRef = input.contentRef === "" ? null : input.contentRef;
  }
  if (input.collectionId !== undefined) {
    body.collectionId = input.collectionId;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...clientOpHeaders(),
  };
  if (input.ifMatchUpdatedAt) {
    headers["If-Match"] = `"${input.ifMatchUpdatedAt}"`;
  }

  const response = await apiFetch<{ data?: LayoutRow }>(`/api/documents/layout/${input.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  return unwrapData(response);
}

export async function publishLayout(id: string): Promise<void> {
  await apiFetchVoid(`/api/documents/layout/${id}/publish`, { method: "PUT" });
}
