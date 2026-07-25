import { apiHeaders } from "../auth/session";

export interface LayoutRow {
  id: string;
  key: string;
  segment: string;
  status: string;
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
  const res = await fetch(
    `/api/documents/layout?segment=${encodeURIComponent(segment)}`,
    { headers: apiHeaders() },
  );
  if (!res.ok) throw new Error(`Failed to load layouts (${res.status})`);
  const body = (await res.json()) as { data?: LayoutRow[] };
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
  const res = await fetch(
    `/api/documents/layout?segment=${encodeURIComponent(segment)}&templateName=${encodeURIComponent(templateName)}`,
    { headers: apiHeaders() },
  );
  if (!res.ok) throw new Error(`Failed to load layout (${res.status})`);
  const body = (await res.json()) as { data?: LayoutRow[] };
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
}): Promise<void> {
  const headers = { ...apiHeaders(), "Content-Type": "application/json" };
  const body: { spec: Record<string, unknown>; contentRef?: string | null } = {
    spec: input.spec,
  };
  if (input.contentRef !== undefined) {
    body.contentRef = input.contentRef === "" ? null : input.contentRef;
  }

  const res = await fetch(`/api/documents/layout/${input.id}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Save failed (${res.status})`);
  }
}

export async function publishLayout(id: string): Promise<void> {
  const res = await fetch(`/api/documents/layout/${id}/publish`, {
    method: "PUT",
    headers: apiHeaders(),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Publish failed (${res.status})`);
  }
}
