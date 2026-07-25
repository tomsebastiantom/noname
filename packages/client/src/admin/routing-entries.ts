import { apiHeaders } from "../auth/session";

export interface PageTreeEntry {
  id: string;
  slug: Record<string, string>;
  pageId: string;
}

export interface MainTreeView {
  id: string;
  status: string;
  pages: PageTreeEntry[];
}

export interface RoutingPageView {
  id: string;
  key: string;
  status: string;
  layoutRef: string;
  contentRef: string;
}

export const ROUTING_DEFAULT_LOCALE = "en-US";

export function isPageTreePath(pathname: string): boolean {
  return pathname === "/admin/pages/tree" || pathname.endsWith("/pages/tree");
}

export function routingPageKeyFromPath(pathname: string): string {
  const match = pathname.match(/^\/admin\/pages\/?([^/]+)/);
  const segment = match?.[1]?.trim() ?? "";
  if (!segment || segment === "tree") return "";
  return segment;
}

export async function loadMainTree(): Promise<MainTreeView | null> {
  const res = await fetch("/api/documents/page_tree/main", { headers: apiHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load page tree (${res.status})`);
  const body = (await res.json()) as { data?: MainTreeView };
  return body.data ?? null;
}

export async function saveMainTree(pages: PageTreeEntry[]): Promise<void> {
  const res = await fetch("/api/documents/page_tree/main", {
    method: "PUT",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ pages }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Save failed (${res.status})`);
  }
}

export async function listRoutingPages(): Promise<RoutingPageView[]> {
  const res = await fetch("/api/documents/routing/pages", { headers: apiHeaders() });
  if (!res.ok) throw new Error(`Failed to load routing pages (${res.status})`);
  const body = (await res.json()) as { data?: RoutingPageView[] };
  return body.data ?? [];
}

export async function loadRoutingPage(pageKey: string): Promise<RoutingPageView | null> {
  const res = await fetch(`/api/documents/routing/pages/${encodeURIComponent(pageKey)}`, {
    headers: apiHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load page (${res.status})`);
  const body = (await res.json()) as { data?: RoutingPageView };
  return body.data ?? null;
}

export async function saveRoutingPage(input: {
  pageKey: string;
  layoutRef: string;
  contentRef?: string | null;
}): Promise<void> {
  const res = await fetch(`/api/documents/page/${encodeURIComponent(input.pageKey)}`, {
    method: "PUT",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      layoutRef: input.layoutRef,
      contentRef: input.contentRef ?? "",
    }),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error ?? `Save failed (${res.status})`);
  }
}
