import { hashValue } from "./cache";
import type { EvalClient } from "./types";

/**
 * Route hashes for change detection.
 *
 * A route is identified by its routing entry plus the layout it points at. Hashing this — never the rendered
 * DOM — means a spec edit changes exactly one route's hash, while a data-only change does not silently alter
 * the hash.
 */
export type RoutingPage = {
  key?: string;
  layoutRef?: string;
  contentRef?: string;
  status?: string;
};

export type LayoutRecord = {
  key?: string;
  status?: string;
  data?: unknown;
};

export function computeRouteHashes(
  pages: RoutingPage[],
  layouts: LayoutRecord[],
): Record<string, string> {
  const layoutByKey = new Map<string, unknown>();
  for (const layout of layouts) {
    const key = layout.key?.trim();
    if (key) layoutByKey.set(key, layout.data ?? null);
  }

  const hashes: Record<string, string> = {};
  for (const page of pages) {
    const route = page.key?.trim();
    if (!route) continue;
    const layoutRef = page.layoutRef?.trim() ?? "";
    hashes[route] = hashValue({
      route,
      layoutRef,
      contentRef: page.contentRef?.trim() ?? "",
      layout: layoutByKey.get(layoutRef) ?? null,
    });
  }
  return hashes;
}

/**
 * Read routing + layouts once and derive route hashes. Returns null when either read fails: without a complete
 * route map a run key would be computed from a partial input set, which is exactly how stale reuse happens.
 */
export async function loadRouteHashes(
  client: EvalClient,
  _tenantSlug: string,
): Promise<Record<string, string> | null> {
  const [routing, layouts] = await Promise.all([
    client.getJson<{ data?: RoutingPage[] }>("/api/documents/routing/pages"),
    client.getJson<{ data?: LayoutRecord[] }>("/api/documents/layout"),
  ]);
  if (!routing.ok || !layouts.ok) return null;
  return computeRouteHashes(routing.data?.data ?? [], layouts.data?.data ?? []);
}
