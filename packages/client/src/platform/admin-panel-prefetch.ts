import type { Spec } from "@json-render/core";
import { fetchWithTimeout } from "@noname/auth";
import { apiHeaders } from "../auth/session";
import { platformTemplateFromPath } from "../platform-routes";
import { assertAdminPanelSpec } from "./admin-layout";

const SCHEMA_FETCH_TIMEOUT_MS = 20_000;

type EdgeSchemaResponse = {
  layout?: Spec;
  renderAs?: string;
};

const panelCache = new Map<string, Spec>();
const inflight = new Map<string, Promise<Spec | null>>();

export function getCachedAdminPanel(template: string): Spec | undefined {
  return panelCache.get(template);
}

export function setCachedAdminPanel(template: string, spec: Spec): void {
  panelCache.set(template, spec);
}

export function clearAdminPanelCache(): void {
  panelCache.clear();
  inflight.clear();
}

function panelTemplateFromHref(href: string): string | null {
  const path = href.split("?")[0]?.split("#")[0]?.trim();
  if (!path?.startsWith("/admin") && !path?.startsWith("/account")) {
    return null;
  }
  return platformTemplateFromPath(path);
}

async function fetchAdminPanelSpec(storeSlug: string, template: string): Promise<Spec | null> {
  const headers = apiHeaders();
  const res = await fetchWithTimeout(
    `/api/edge/schema/${storeSlug}?segment=default&template=${encodeURIComponent(template)}`,
    { headers },
    SCHEMA_FETCH_TIMEOUT_MS,
  );
  if (!res.ok) return null;

  const body = (await res.json()) as { data?: EdgeSchemaResponse };
  const tree = body?.data?.layout;
  if (!tree || body?.data?.renderAs !== "panel") return null;

  try {
    return assertAdminPanelSpec(tree);
  } catch {
    return null;
  }
}

/** Prefetch admin panel spec on sidebar hover (U4). No-op when cached or in flight. */
export function prefetchAdminPanel(storeSlug: string, href: string): void {
  const template = panelTemplateFromHref(href);
  if (!template || panelCache.has(template) || inflight.has(template)) {
    return;
  }

  const promise = fetchAdminPanelSpec(storeSlug, template)
    .then((spec) => {
      if (spec) panelCache.set(template, spec);
      return spec;
    })
    .finally(() => {
      inflight.delete(template);
    });

  inflight.set(template, promise);
}
