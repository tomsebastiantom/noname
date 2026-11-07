import type { Check, CheckResult } from "../types";

/**
 * M3.reachability — the routing graph is closed.
 *
 * Both directions matter, and they fail differently:
 *  - a `page_tree` entry whose `pageId` does not exist is a route that silently falls back (the edge serves
 *    the home template instead of a 404, which is why the route check measures the fallback separately);
 *  - a published page that is absent from `page_tree` exists but is unreachable — the editor can see it, the
 *    customer cannot.
 *
 * Draft pages are deliberately not required to be in the tree; they are not customer-visible yet.
 */

type PageTreeEntry = {
  id?: string;
  pageId?: string;
  slug?: Record<string, string>;
};

type PageTreeResponse = { data?: { pages?: PageTreeEntry[] } };
type RoutingPage = { key?: string; status?: string };
type RoutingPagesResponse = { data?: RoutingPage[] };

const reachability: Check["run"] = async (ctx) => {
  const tree = await ctx.client.getJson<PageTreeResponse>("/api/documents/page_tree/main");
  if (!tree.ok) {
    return [
      {
        id: "M3.reachability",
        status: tree.status === 404 ? "fail" : "skip",
        level: "error",
        detail:
          tree.status === 404
            ? "page_tree/main does not exist — the storefront has no routing graph"
            : `could not read page_tree/main (${tree.error}) — reachability was not evaluated`,
      },
    ];
  }

  const routing = await ctx.client.getJson<RoutingPagesResponse>("/api/documents/routing/pages");
  if (!routing.ok) {
    return [
      {
        id: "M3.reachability",
        status: "skip",
        level: "error",
        detail: `could not list routing pages (${routing.error}) — reachability was not evaluated`,
      },
    ];
  }

  const entries = tree.data?.data?.pages ?? [];
  const pages = routing.data?.data ?? [];
  const pageKeys = new Set(
    pages.map((page) => page.key).filter((key): key is string => Boolean(key)),
  );
  const treePageIds = new Set(
    entries.map((entry) => entry.pageId).filter((id): id is string => Boolean(id)),
  );

  const results: CheckResult[] = [];

  for (const entry of entries) {
    const key = entry.pageId;
    if (!key) {
      results.push({
        id: "M3.reachability",
        status: "fail",
        level: "error",
        subject: entry.id ?? "(unnamed entry)",
        detail: "page_tree entry has no pageId",
      });
      continue;
    }
    if (!pageKeys.has(key)) {
      results.push({
        id: "M3.reachability",
        status: "fail",
        level: "error",
        subject: key,
        detail: `page_tree entry points at page "${key}", which does not exist`,
      });
      continue;
    }
    const slugs = Object.values(entry.slug ?? {}).filter((slug) => slug?.trim());
    if (slugs.length === 0) {
      results.push({
        id: "M3.reachability",
        status: "fail",
        level: "error",
        subject: key,
        detail: `page "${key}" is in page_tree but has no route (empty slug map)`,
      });
    }
  }

  for (const page of pages) {
    if (page.status !== "published") continue;
    if (!page.key) continue;
    if (!treePageIds.has(page.key)) {
      results.push({
        id: "M3.reachability",
        status: "fail",
        level: "error",
        subject: page.key,
        detail: `page "${page.key}" is published but absent from page_tree — it cannot be reached`,
      });
    }
  }

  return results.length > 0
    ? results
    : [
        {
          id: "M3.reachability",
          status: "pass",
          level: "error",
          detail: `${entries.length} page_tree entr(ies), ${pages.length} page(s) — all reachable`,
        },
      ];
};

export const reachabilityChecks: Check[] = [
  {
    meta: {
      id: "M3.reachability",
      tier: 0,
      defaultLevel: "error",
      needs: ["api"],
      emits: ["M3.reachability"],
      description:
        "every page_tree entry points at an existing page, and every published page is reachable",
    },
    run: reachability,
  },
];
