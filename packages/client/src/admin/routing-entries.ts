import { apiFetch, apiFetchDataOptional, apiFetchVoid } from "../lib/api";

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
  return apiFetchDataOptional<MainTreeView>("/api/documents/page_tree/main");
}

export async function saveMainTree(pages: PageTreeEntry[]): Promise<void> {
  await apiFetchVoid("/api/documents/page_tree/main", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pages }),
  });
}

export async function listRoutingPages(): Promise<RoutingPageView[]> {
  const body = await apiFetch<{ data?: RoutingPageView[] }>("/api/documents/routing/pages");
  return body.data ?? [];
}

export async function loadRoutingPage(pageKey: string): Promise<RoutingPageView | null> {
  return apiFetchDataOptional<RoutingPageView>(
    `/api/documents/routing/pages/${encodeURIComponent(pageKey)}`,
  );
}

export async function saveRoutingPage(input: {
  pageKey: string;
  layoutRef: string;
  contentRef?: string | null;
}): Promise<void> {
  await apiFetchVoid(`/api/documents/page/${encodeURIComponent(input.pageKey)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      layoutRef: input.layoutRef,
      contentRef: input.contentRef ?? "",
    }),
  });
}
