import {
  listRoutingPages,
  loadMainTree,
  loadRoutingPage,
  type PageTreeEntry,
  type RoutingPageView,
  saveMainTree,
  saveRoutingPage,
} from "../../admin/routing-entries";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

export type RoutingPageLoaded = RoutingPageView & { loadedAt: number };

function withPageLoadedAt(page: RoutingPageView): RoutingPageLoaded {
  return { ...page, loadedAt: Date.now() };
}

export const routingActions = {
  listRoutingPages: (async (_params, setState) => {
    setState(ADMIN_STATE.routing.loading, true);
    setState(ADMIN_STATE.routing.error, null);
    try {
      setState(ADMIN_STATE.routing.pages, await listRoutingPages());
    } catch (err) {
      setState(ADMIN_STATE.routing.error, err instanceof Error ? err.message : String(err));
    } finally {
      setState(ADMIN_STATE.routing.loading, false);
    }
  }) satisfies CatalogActionHandler,

  loadRoutingPage: (async (params, setState) => {
    const { pageKey } = params as { pageKey: string };
    setState(ADMIN_STATE.routing.loading, true);
    setState(ADMIN_STATE.routing.error, null);
    try {
      const row = await loadRoutingPage(pageKey);
      if (!row) {
        throw new Error(`Routing page "${pageKey}" not found`);
      }
      setState(ADMIN_STATE.routing.currentPage, withPageLoadedAt(row));
    } catch (err) {
      setState(ADMIN_STATE.routing.error, err instanceof Error ? err.message : String(err));
    } finally {
      setState(ADMIN_STATE.routing.loading, false);
    }
  }) satisfies CatalogActionHandler,

  saveRoutingPage: (async (params, setState) => {
    const { pageKey, layoutRef, contentRef } = params as {
      pageKey: string;
      layoutRef: string;
      contentRef?: string | null;
    };
    await saveRoutingPage({ pageKey, layoutRef, contentRef });
    const row = await loadRoutingPage(pageKey);
    if (row) {
      setState(ADMIN_STATE.routing.currentPage, withPageLoadedAt(row));
    }
  }) satisfies CatalogActionHandler,

  loadMainTree: (async (_params, setState) => {
    setState(ADMIN_STATE.routing.treeLoading, true);
    setState(ADMIN_STATE.routing.treeError, null);
    try {
      const tree = await loadMainTree();
      setState(ADMIN_STATE.routing.treePages, tree?.pages ?? []);
      setState(ADMIN_STATE.routing.treeStatus, tree?.status ?? null);
      setState(ADMIN_STATE.routing.treeLoadedAt, Date.now());
    } catch (err) {
      setState(ADMIN_STATE.routing.treeError, err instanceof Error ? err.message : String(err));
    } finally {
      setState(ADMIN_STATE.routing.treeLoading, false);
    }
  }) satisfies CatalogActionHandler,

  saveMainTree: (async (params, setState) => {
    const { pages } = params as { pages: PageTreeEntry[] };
    await saveMainTree(pages);
    const tree = await loadMainTree();
    setState(ADMIN_STATE.routing.treePages, tree?.pages ?? []);
    setState(ADMIN_STATE.routing.treeStatus, tree?.status ?? null);
    setState(ADMIN_STATE.routing.treeLoadedAt, Date.now());
  }) satisfies CatalogActionHandler,
};
