import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { fetchWithTimeout } from "@noname/auth";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  apiHeaders,
  clearSession,
  hydrateTokenFromCookie,
  isLoggedIn,
  redirectToLoginAfterUnauthorized,
} from "../auth/session";
import { fetchAuthSessionStatus, sessionCanDraft } from "../auth/team-users";
import { type CatalogManifest, loadCatalogs, manifestFingerprint } from "../catalog-loader";
import { ApiAuthError, isAuthError } from "../lib/api";
import { adminShellPropsFromSpec, assertAdminPanelSpec } from "./admin-layout";
import {
  clearAdminPanelCache,
  getCachedAdminPanel,
  setCachedAdminPanel,
} from "./admin-panel-prefetch";
import {
  initBrowserObservability,
  subscribeFlagLayoutRefresh,
  syncBrowserObservabilityContext,
  syncObservabilityUserFromSession,
} from "./browser-observability";
import { registry as platformRegistry } from "./registry";

export type LayoutRenderAs = "standalone" | "shell" | "panel" | "editor";
export type AdminShellProps = Record<string, unknown>;

export interface EdgeSchemaResponse {
  siteId?: string;
  layout?: Spec;
  templateName?: string;
  contentRef?: string | null;
  renderAs?: LayoutRenderAs;
  shell?: Spec;
  shellRef?: string | null;
  flags?: Record<string, unknown>;
  segment?: string;
}

const SCHEMA_FETCH_TIMEOUT_MS = 20_000;

async function fetchTenantCatalogManifest(
  slug: string,
  headers: HeadersInit,
): Promise<CatalogManifest | null> {
  try {
    const res = await fetchWithTimeout(
      `/api/tenants/${slug}/catalog`,
      { headers },
      SCHEMA_FETCH_TIMEOUT_MS,
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: CatalogManifest };
    return body?.data ?? null;
  } catch {
    return null;
  }
}

function redirectTo(
  url: string,
  setLoading: (v: boolean) => void,
  setNavigating: (v: boolean) => void,
): void {
  setLoading(false);
  setNavigating(false);
  window.location.href = url;
}

export interface AppRouteInput {
  storeSlug: string | null;
  pathname: string;
  platformRoute: boolean;
  template: string;
  adminRoute: boolean;
  editMode: boolean;
}

export interface AppPageLoader {
  spec: Spec | null;
  composeMode: "full" | "panel";
  adminPanelSpec: Spec | null;
  adminBaseShellProps: AdminShellProps | null;
  registry: ComponentRegistry;
  shellKey: string;
  layoutTemplateName: string;
  pageContentRef: string | null;
  editorShellSpec: Spec | null;
  layoutRenderAs: LayoutRenderAs;
  error: string | null;
  loading: boolean;
  navigating: boolean;
  loadPage: () => void;
}

/** All App data-loading state + catalog/schema fetch + renderAs branching. */
export function useAppPageLoader(input: AppRouteInput): AppPageLoader {
  const { storeSlug, pathname, platformRoute, template, adminRoute, editMode } = input;
  const [spec, setSpec] = useState<Spec | null>(null);
  const [composeMode, setComposeMode] = useState<"full" | "panel">("full");
  const [adminPanelSpec, setAdminPanelSpec] = useState<Spec | null>(null);
  const [adminBaseShellProps, setAdminBaseShellProps] = useState<AdminShellProps | null>(null);
  const [registry, setRegistry] = useState<ComponentRegistry>(platformRegistry);
  const [shellKey, setShellKey] = useState("");
  const [layoutTemplateName, setLayoutTemplateName] = useState("");
  const [pageContentRef, setPageContentRef] = useState<string | null>(null);
  const [editorShellSpec, setEditorShellSpec] = useState<Spec | null>(null);
  const [layoutRenderAs, setLayoutRenderAs] = useState<LayoutRenderAs>("standalone");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const contentRef = useRef<Spec | AdminShellProps | null>(null);
  const loadSeqRef = useRef(0);
  const adminShellCacheRef = useRef<{ shellRef: string; props: AdminShellProps } | null>(null);
  const catalogHashRef = useRef<string | null>(null);
  const [, startPanelTransition] = useTransition();

  const loadPage = useCallback(async () => {
    const loadSeq = ++loadSeqRef.current;
    const isStale = () => loadSeq !== loadSeqRef.current;

    hydrateTokenFromCookie();
    await initBrowserObservability();
    syncObservabilityUserFromSession();

    if (!storeSlug) {
      setError("Use {slug}.localhost:5173 — e.g. yogastore.localhost:5173 (run pnpm seed:demo)");
      setLoading(false);
      setNavigating(false);
      return;
    }

    if ((adminRoute || editMode) && !isLoggedIn()) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      redirectTo(`/login?redirect=${redirect}`, setLoading, setNavigating);
      return;
    }

    const softAdminNav = adminRoute && contentRef.current !== null;

    if ((adminRoute || editMode) && isLoggedIn() && !softAdminNav) {
      try {
        const session = await fetchAuthSessionStatus();
        if (editMode && !sessionCanDraft(session)) {
          const url = new URL(window.location.href);
          url.searchParams.delete("edit");
          setLoading(false);
          setNavigating(false);
          window.location.replace(url.pathname + url.search + url.hash);
          return;
        }
        const mfaEnrollPath = "/admin/settings/security";
        const needsMfaGate =
          (editMode || pathname.startsWith("/admin")) && !pathname.startsWith(mfaEnrollPath);
        if (needsMfaGate && session.requireMfaForAdmin && !session.mfaEnrolled) {
          const redirect = encodeURIComponent(pathname + window.location.search);
          redirectTo(
            `${mfaEnrollPath}?redirect=${redirect}&mfaRequired=1`,
            setLoading,
            setNavigating,
          );
          return;
        }
      } catch (err) {
        if (editMode && isAuthError(err)) {
          clearSession();
          const redirect = encodeURIComponent(window.location.pathname + window.location.search);
          redirectTo(`/login?redirect=${redirect}`, setLoading, setNavigating);
          return;
        }
        // Session check failed — still load page; API calls will 401 if needed.
      }
    }

    if (softAdminNav) {
      const cachedPanel = getCachedAdminPanel(template);
      if (cachedPanel) {
        startPanelTransition(() => {
          setAdminPanelSpec(cachedPanel);
          setShellKey(template);
        });
      }
    } else if (contentRef.current !== null) {
      setNavigating(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const headers = apiHeaders();
    const manifestPromise = fetchTenantCatalogManifest(storeSlug, headers).then((manifest) => {
      if (!manifest) return null;
      const hash = manifestFingerprint(manifest);
      const previousHash = catalogHashRef.current;
      catalogHashRef.current = hash;
      if (softAdminNav && previousHash === hash) {
        return null;
      }
      return manifest;
    });

    const editQuery = editMode && !platformRoute ? "&edit=true" : "";
    const schemaQuery = platformRoute
      ? `segment=default&template=${encodeURIComponent(template)}`
      : `segment=default&url=${encodeURIComponent(pathname)}${editQuery}`;

    const specPromise = fetchWithTimeout(
      `/api/edge/schema/${storeSlug}?${schemaQuery}`,
      { headers },
      SCHEMA_FETCH_TIMEOUT_MS,
    ).then((res) => {
      if (res.status === 401) {
        redirectToLoginAfterUnauthorized();
        throw new ApiAuthError();
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ data?: EdgeSchemaResponse }>;
    });

    try {
      const [manifest, body] = await Promise.all([manifestPromise, specPromise]);
      if (isStale()) return;

      const tree = body?.data?.layout as Spec | undefined;
      if (!tree) throw new Error("No layout spec returned");

      if (manifest) {
        const loaded = await loadCatalogs(manifest);
        if (isStale()) return;
        setRegistry(loaded.registry);
      }

      const renderAs = body?.data?.renderAs ?? "standalone";
      const resolvedTemplateName = body?.data?.templateName ?? template;
      setLayoutTemplateName(resolvedTemplateName);
      setPageContentRef(body?.data?.contentRef ?? null);
      setLayoutRenderAs(renderAs);

      if (renderAs === "editor") {
        const shellTree = body?.data?.shell as Spec | undefined;
        const shellRef = body?.data?.shellRef ?? null;
        if (!shellTree || !shellRef) {
          throw new Error("Editor layout missing shellRef or shell spec");
        }

        adminShellCacheRef.current = null;
        clearAdminPanelCache();
        setComposeMode("full");
        setAdminBaseShellProps(null);
        setAdminPanelSpec(null);
        setEditorShellSpec(shellTree);
        setSpec(tree);
        setShellKey(`${template}:${pathname}:edit`);
        contentRef.current = tree;
      } else if (renderAs === "panel") {
        const shellTree = body?.data?.shell as Spec | undefined;
        const shellRef = body?.data?.shellRef ?? null;
        if (!shellTree || !shellRef) {
          throw new Error("Panel layout missing shellRef or shell spec");
        }

        const panelSpec = assertAdminPanelSpec(tree);
        const baseShellProps =
          adminShellCacheRef.current?.shellRef === shellRef
            ? adminShellCacheRef.current.props
            : adminShellPropsFromSpec(shellTree);
        if (!baseShellProps) {
          throw new Error(`Shell layout "${shellRef}" missing AdminShell`);
        }

        if (adminShellCacheRef.current?.shellRef !== shellRef) {
          adminShellCacheRef.current = { shellRef, props: baseShellProps };
        }

        setCachedAdminPanel(template, panelSpec);
        startPanelTransition(() => {
          setComposeMode("panel");
          setAdminBaseShellProps(baseShellProps);
          setAdminPanelSpec(panelSpec);
          setSpec(null);
          setShellKey(template);
          contentRef.current = baseShellProps;
          setEditorShellSpec(null);
        });
      } else {
        adminShellCacheRef.current = null;
        clearAdminPanelCache();
        setComposeMode("full");
        setAdminBaseShellProps(null);
        setAdminPanelSpec(null);
        setEditorShellSpec(null);
        setSpec(tree);
        setShellKey(`${template}:${pathname}`);
        contentRef.current = tree;
      }

      void syncBrowserObservabilityContext(
        { contextHash: body?.data?.segment ?? "default" },
        body?.data?.flags,
      );
    } catch (err) {
      if (isStale()) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!isStale()) {
        setLoading(false);
        setNavigating(false);
      }
    }
  }, [storeSlug, template, adminRoute, editMode, platformRoute, pathname]);

  useEffect(() => {
    if (layoutRenderAs === "editor") {
      void import("../editor");
    }
  }, [layoutRenderAs]);

  useEffect(() => {
    return subscribeFlagLayoutRefresh(() => {
      void loadPage();
    });
  }, [loadPage]);

  // Stable caller: main.tsx runs loadPage in a useEffect keyed on this identity.
  // Returning an inline wrapper would recreate it every render and refetch forever.
  const reloadPage = useCallback(() => void loadPage(), [loadPage]);

  return {
    spec,
    composeMode,
    adminPanelSpec,
    adminBaseShellProps,
    registry,
    shellKey,
    layoutTemplateName,
    pageContentRef,
    editorShellSpec,
    layoutRenderAs,
    error,
    loading,
    navigating,
    loadPage: reloadPage,
  };
}
