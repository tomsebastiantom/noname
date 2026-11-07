import { catalogPropRequirement } from "@noname/catalog";
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
    layout?: {
      root?: string;
      elements?: Record<string, { type?: unknown; props?: Record<string, unknown> }>;
    };
  };
};

type RoutingPagesResponse = {
  data?: Array<{ key?: string; layoutRef?: string; contentRef?: string; status?: string }>;
};

type LayoutElement = { type?: unknown; props?: Record<string, unknown> };
type LayoutRecord = {
  key?: string;
  status?: string;
  data?: { spec?: { elements?: Record<string, LayoutElement> } };
};
type LayoutsResponse = { data?: LayoutRecord[] };

/** Identity of a resolved page: the template plus the shape of its element tree. */
function signatureOf(response: EdgeSchemaResponse): string {
  const template = response.data?.templateName ?? "(none)";
  const elementKeys = Object.keys(response.data?.layout?.elements ?? {}).sort();
  return `${template}|${elementKeys.join(",")}`;
}

/** A json-render expression (`$state`, `$item`, `$computed`, …) anywhere in a prop value. */
function hasBinding(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasBinding);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Object.keys(record).some((key) => key.startsWith("$"))) return true;
    return Object.values(record).some(hasBinding);
  }
  return false;
}

function dynamicPropKeys(props: Record<string, unknown> | undefined): string[] {
  if (!props) return [];
  return Object.entries(props)
    .filter(([, value]) => hasBinding(value))
    .map(([key]) => key);
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
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
            (page): page is { key: string; layoutRef: string; contentRef?: string } =>
              typeof page.key === "string" && typeof page.layoutRef === "string",
          )
          .map((page) => [page.key, page]),
      )
    : null;

  // Raw layouts are needed for R3: the resolved spec alone cannot tell a static prop from one that was
  // supposed to come from content and resolved to nothing.
  const layouts = await ctx.client.getJson<LayoutsResponse>("/api/documents/layout");
  const rawLayoutByTemplate = layouts.ok
    ? new Map(
        (layouts.data?.data ?? [])
          .filter(
            (layout): layout is LayoutRecord & { key: string } => typeof layout.key === "string",
          )
          .map((layout) => [layout.key, layout.data?.spec?.elements ?? {}]),
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

  let r3Checked = false;
  if (!layouts.ok) {
    results.push({
      id: "R3.content",
      status: "skip",
      level: "error",
      detail: `could not list layouts (${layouts.error}) — content resolution was not checked`,
    });
  }

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
    const pageRouting = layoutByPageKey?.get(pageId ?? "");
    const expectedLayout = pageRouting?.layoutRef;
    const contentRef = pageRouting?.contentRef ?? null;

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

    // R3 — every prop that the raw layout binds to state must have resolved to a non-empty value in the
    // edge response. A published page whose content was deleted (or never filled) leaves the placeholder
    // empty here, while the template itself still renders.
    if (rawLayoutByTemplate && expectedLayout) {
      const rawElements = rawLayoutByTemplate.get(expectedLayout) ?? {};
      const problems: string[] = [];
      let bound = 0;

      for (const [key, rawElement] of Object.entries(rawElements)) {
        const rawType = typeof rawElement.type === "string" ? rawElement.type : "";
        for (const prop of dynamicPropKeys(rawElement.props)) {
          bound += 1;
          const resolved = elements[key]?.props?.[prop];
          if (isEmptyValue(resolved) && catalogPropRequirement(rawType, prop) === "required") {
            problems.push(`${key}.${prop}`);
          }
        }
      }

      if (problems.length > 0) {
        r3Checked = true;
        results.push({
          id: "R3.content",
          status: "fail",
          level: "error",
          subject: route,
          detail: `${problems.length} content-bound prop(s) resolved empty (${problems.slice(0, 3).join(", ")})${contentRef ? ` — contentRef "${contentRef}"` : ""}`,
        });
      } else if (bound > 0) {
        r3Checked = true;
        results.push({
          id: "R3.content",
          status: "pass",
          level: "error",
          subject: route,
          detail: `${bound} content-bound prop(s) resolved${contentRef ? ` for "${contentRef}"` : ""}`,
        });
      }
    }
  }

  if (layouts.ok && !r3Checked) {
    results.push({
      id: "R3.content",
      status: routing.ok ? "pass" : "skip",
      level: "error",
      detail: routing.ok
        ? "no route renders content-bound props"
        : "routing pages were unavailable — content bindings could not be located",
    });
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
      emits: ["R1.resolve", "R1.fallback", "R2.blocks", "R3.content"],
      description: "every published route resolves to its own page, not to the fallback template",
    },
    run: routes,
  },
];
