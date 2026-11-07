import type { Check, CheckResult } from "../types";

/**
 * Tier 1 — route checks over HTTP only. No browser.
 *
 * `R1.resolve` began as "does the route return 200", which testing proved useless: a dangling
 * `page_tree` entry **does not 404**, the edge falls back to the home template. Measured on a live
 * tenant, a route pointing at a page id that does not exist resolved with `templateName=home` and the
 * same seven blocks as `/`.
 *
 * So the check is fallback detection instead: probe a route that cannot exist, remember the signature of
 * whatever it returns, and fail any real route that produces that same signature. The fallback is
 * therefore measured per run rather than assumed — and if the platform ever starts returning 404 for
 * unknown routes, this degrades to "unknown routes 404", which the probe reports as a skip of the
 * comparison rather than a false pass.
 */

type PageTreeResponse = {
  data?: {
    pages?: Array<{ id?: string; slug?: Record<string, string>; pageId?: string }>;
  };
};

type EdgeSchemaResponse = {
  data?: {
    templateName?: string;
    layout?: { root?: string; elements?: Record<string, { type?: unknown }> };
  };
};

type RoutingPagesResponse = {
  data?: Array<{ key?: string; layoutRef?: string; status?: string }>;
};

/** Identity of a resolved page: the template plus the shape of its element tree. */
function signatureOf(response: EdgeSchemaResponse): string {
  const template = response.data?.templateName ?? "(none)";
  const elementKeys = Object.keys(response.data?.layout?.elements ?? {}).sort();
  return `${template}|${elementKeys.join(",")}`;
}

function routesFromTree(
  tree: PageTreeResponse,
  maxRoutes: number,
): Array<{ route: string; pageId?: string }> {
  const pages = tree.data?.pages ?? [];
  const routes = new Map<string, { route: string; pageId?: string }>();
  for (const page of pages) {
    const slug = page.slug ?? {};
    // Prefer the canonical locale, then any locale — the tree is locale-keyed.
    const value = slug["en-US"] ?? Object.values(slug)[0];
    if (value) {
      const route = value.startsWith("/") ? value : `/${value}`;
      routes.set(route, { route, pageId: page.pageId });
    }
  }
  return [...routes.values()].sort((a, b) => a.route.localeCompare(b.route)).slice(0, maxRoutes);
}

const routes: Check["run"] = async (ctx) => {
  const results: CheckResult[] = [];

  const tree = await ctx.client.getJson<PageTreeResponse>("/api/documents/page_tree/main");
  if (!tree.ok) {
    return [
      {
        id: "R1.resolve",
        status: "fail",
        level: "error",
        subject: "page_tree",
        detail: `could not load page_tree/main (${tree.error}) — without it no route can be resolved`,
      },
    ];
  }

  const routeList = routesFromTree(tree.data, ctx.maxRoutes);
  if (routeList.length === 0) {
    return [
      {
        id: "R1.resolve",
        status: "fail",
        level: "error",
        subject: "page_tree",
        detail: "page_tree/main is present but declares no routes",
      },
    ];
  }

  // The page's declared template is what R2 compares the resolved spec against. If this read fails, R2
  // must skip the comparison rather than silently pass it.
  const routing = await ctx.client.getJson<RoutingPagesResponse>("/api/documents/routing/pages");
  const layoutByPageKey = routing.ok
    ? new Map(
        (routing.data?.data ?? [])
          .filter(
            (page): page is { key: string; layoutRef: string } =>
              typeof page.key === "string" && typeof page.layoutRef === "string",
          )
          .map((page) => [page.key, page.layoutRef]),
      )
    : null;

  // Measure the fallback rather than assuming it: a route that cannot exist tells us what the edge
  // serves for a miss.
  const probeRoute = `/_eval_probe_${Date.now().toString(36)}`;
  const probe = await ctx.client.getJson<EdgeSchemaResponse>(
    `/api/edge/schema/${encodeURIComponent(ctx.tenantSlug)}?url=${encodeURIComponent(probeRoute)}`,
  );
  const fallbackSignature = probe.ok ? signatureOf(probe.data) : null;

  results.push({
    id: "R1.fallback",
    status: "pass",
    level: "warn",
    subject: "probe",
    detail: probe.ok
      ? `unknown routes are served by fallback "${probe.data?.data?.templateName ?? "?"}" — real routes must not share it`
      : `unknown routes are rejected (${probe.error}), so no fallback masking is possible`,
  });

  for (const { route, pageId } of routeList) {
    const response = await ctx.client.getJson<EdgeSchemaResponse>(
      `/api/edge/schema/${encodeURIComponent(ctx.tenantSlug)}?url=${encodeURIComponent(route)}`,
    );

    if (!response.ok) {
      results.push({
        id: "R1.resolve",
        status: "fail",
        level: "error",
        subject: route,
        detail: `route does not resolve (${response.error}) — page_tree declares pageId "${pageId ?? "?"}"`,
      });
      continue;
    }

    const signature = signatureOf(response.data);
    const template = response.data?.data?.templateName ?? "(none)";

    if (fallbackSignature !== null && signature === fallbackSignature && route !== "/") {
      results.push({
        id: "R1.resolve",
        status: "fail",
        level: "error",
        subject: route,
        detail: `silently serves the fallback template "${template}" — page_tree declares pageId "${pageId ?? "?"}", which does not resolve to its own page`,
      });
      continue;
    }

    results.push({
      id: "R1.resolve",
      status: "pass",
      level: "error",
      subject: route,
      detail: `resolves to "${template}"`,
    });

    const elements = response.data?.data?.layout?.elements ?? {};
    const elementKeys = Object.keys(elements);
    const untyped = elementKeys.filter((key) => {
      const type = elements[key]?.type;
      return typeof type !== "string" || type.trim() === "";
    });
    const expectedLayout = layoutByPageKey?.get(pageId ?? "");

    if (elementKeys.length === 0) {
      results.push({
        id: "R2.blocks",
        status: "fail",
        level: "error",
        subject: route,
        detail: "route resolves but renders 0 blocks — the page resolves to nothing",
      });
    } else if (untyped.length > 0) {
      results.push({
        id: "R2.blocks",
        status: "fail",
        level: "error",
        subject: route,
        detail: `${untyped.length} element(s) have no block type (${untyped.slice(0, 3).join(", ")})`,
      });
    } else if (layoutByPageKey === null) {
      results.push({
        id: "R2.blocks",
        status: "skip",
        level: "error",
        subject: route,
        detail: `${elementKeys.length} block(s); template cross-check skipped — routing pages were unavailable`,
      });
    } else if (!expectedLayout) {
      results.push({
        id: "R2.blocks",
        status: "fail",
        level: "error",
        subject: route,
        detail: `page "${pageId ?? "?"}" has no routing record declaring a layoutRef — the resolved template cannot be checked`,
      });
    } else if (template !== expectedLayout) {
      results.push({
        id: "R2.blocks",
        status: "fail",
        level: "error",
        subject: route,
        detail: `resolved to template "${template}" but page "${pageId}" declares "${expectedLayout}"`,
      });
    } else {
      results.push({
        id: "R2.blocks",
        status: "pass",
        level: "error",
        subject: route,
        detail: `${elementKeys.length} block(s), template "${template}"`,
      });
    }
  }

  return results;
};

export const routeChecks: Check[] = [
  {
    meta: {
      id: "R1.resolve",
      tier: 1,
      defaultLevel: "error",
      needs: ["api"],
      emits: ["R1.resolve", "R1.fallback", "R2.blocks"],
      description: "every published route resolves to its own page, not to the fallback template",
    },
    run: routes,
  },
];
