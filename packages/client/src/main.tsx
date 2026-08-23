import "./index.css";
import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { fetchWithTimeout } from "@noname/auth";
import { storeSlugFromHost } from "@noname/shared";
import {
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { createRoot } from "react-dom/client";
import {
  apiHeaders,
  clearSession,
  hydrateTokenFromCookie,
  isLoggedIn,
  redirectToLoginAfterUnauthorized,
} from "./auth/session";
import { fetchAuthSessionStatus, sessionCanDraft } from "./auth/team-users";
import { type CatalogManifest, loadCatalogs, manifestFingerprint } from "./catalog-loader";
import { AuthBar } from "./core/components/AuthBar";
import { ApiAuthError, isAuthError } from "./lib/api";
import { adminShellPropsFromSpec, assertAdminPanelSpec } from "./platform/admin-layout";
import {
  clearAdminPanelCache,
  getCachedAdminPanel,
  setCachedAdminPanel,
} from "./platform/admin-panel-prefetch";
import { AdminPlatformView } from "./platform/admin-platform-view";
import { getPathname, subscribeAppLocation } from "./platform/app-navigation";
import {
  initBrowserObservability,
  subscribeFlagLayoutRefresh,
  syncBrowserObservabilityContext,
  syncObservabilityUserFromSession,
} from "./platform/browser-observability";
import { CatalogUiShell } from "./platform/catalog-ui-shell";
import { registry as platformRegistry } from "./platform/registry";
import { isLoginTemplate, resolveRoute } from "./platform-routes";

type LayoutRenderAs = "standalone" | "shell" | "panel" | "editor";
type AdminShellProps = Record<string, unknown>;

interface EdgeSchemaResponse {
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

const EditPageView = lazy(() => import("./editor").then((m) => ({ default: m.EditPageView })));

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

function appShellClassName(template: string, lockViewport?: boolean): string {
  if (lockViewport) return "flex h-dvh flex-col overflow-hidden bg-background";
  if (isLoginTemplate(template)) return "noname-auth flex h-dvh flex-col overflow-hidden";
  return "min-h-screen bg-background";
}

function AppShell({
  children,
  template,
  lockViewport,
}: Readonly<{ children: ReactNode; template: string; lockViewport?: boolean }>) {
  return <div className={appShellClassName(template, lockViewport)}>{children}</div>;
}

function App() {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [composeMode, setComposeMode] = useState<"full" | "panel">("full");
  const [adminPanelSpec, setAdminPanelSpec] = useState<Spec | null>(null);
  const [adminBaseShellProps, setAdminBaseShellProps] = useState<AdminShellProps | null>(null);
  const [registry, setRegistry] = useState<ComponentRegistry>(platformRegistry);
  const [shellKey, setShellKey] = useState("");
  const [layoutTemplateName, setLayoutTemplateName] = useState("");
  const [pageContentRef, setPageContentRef] = useState<string | null>(null);
  const [layoutRenderAs, setLayoutRenderAs] = useState<LayoutRenderAs>("standalone");
  const [editorShellSpec, setEditorShellSpec] = useState<Spec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const contentRef = useRef<Spec | AdminShellProps | null>(null);
  const loadSeqRef = useRef(0);
  const adminShellCacheRef = useRef<{ shellRef: string; props: AdminShellProps } | null>(null);
  const catalogHashRef = useRef<string | null>(null);
  const [, startPanelTransition] = useTransition();
  const storeSlug = storeSlugFromHost(window.location.hostname);

  const pathname = useSyncExternalStore(subscribeAppLocation, getPathname, getPathname);
  const route = resolveRoute(pathname);
  const platformRoute = route.kind === "platform";
  const template = platformRoute ? route.template : "storefront";
  const adminRoute = route.kind === "platform" ? route.requiresAuth : false;
  const editMode = new URLSearchParams(window.location.search).get("edit") === "true";
  const panelRoute = composeMode === "panel";

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
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (layoutRenderAs === "editor") {
      void import("./editor");
    }
  }, [layoutRenderAs]);

  useEffect(() => {
    return subscribeFlagLayoutRefresh(() => {
      void loadPage();
    });
  }, [loadPage]);

  const hasContent = spec !== null || adminBaseShellProps !== null;

  if (loading && !hasContent) {
    return (
      <AppShell template={template}>
        <div className="flex flex-1 items-center justify-center p-12 text-muted-foreground">
          Loading…
        </div>
      </AppShell>
    );
  }

  if (error && !hasContent) {
    return (
      <AppShell template={template}>
        <div className="flex flex-1 items-center justify-center p-12 text-destructive">
          Error: {error}
        </div>
      </AppShell>
    );
  }

  if (!hasContent || !storeSlug) {
    return (
      <AppShell template={template}>
        <div className="flex flex-1 items-center justify-center p-12 text-muted-foreground">
          No spec found
        </div>
      </AppShell>
    );
  }

  const shellRouteKey = shellKey || `${template}:${pathname}`;

  const storefrontRoute = route.kind === "storefront";
  const editorRoute = layoutRenderAs === "editor";

  let mainContent: ReactNode = null;
  if (panelRoute && adminBaseShellProps) {
    mainContent = (
      <AdminPlatformView
        key="admin"
        baseShellProps={adminBaseShellProps}
        panelSpec={adminPanelSpec}
        panelKey={template}
        registry={registry}
      />
    );
  } else if (editorRoute && spec && editorShellSpec && layoutTemplateName) {
    mainContent = (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={<p className="p-8 text-muted-foreground">Loading editor…</p>}>
          <EditPageView
            displaySpec={spec}
            shellSpec={editorShellSpec}
            templateName={layoutTemplateName}
            pageContentRef={pageContentRef}
            registry={registry}
            onReload={() => void loadPage()}
          />
        </Suspense>
      </div>
    );
  } else if (spec) {
    mainContent = (
      <div
        className={
          isLoginTemplate(template) ? "flex min-h-0 flex-1 flex-col overflow-hidden" : undefined
        }
      >
        <CatalogUiShell key={shellRouteKey} spec={spec} registry={registry} />
      </div>
    );
  }

  return (
    <AppShell template={template} lockViewport={editorRoute}>
      {!adminRoute && storefrontRoute ? <AuthBar onAuthChange={() => void loadPage()} /> : null}
      {error ? (
        <div className="shrink-0 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {navigating && !adminRoute ? (
          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-50 h-0.5 animate-pulse bg-primary"
            role="progressbar"
            aria-label="Loading page"
          />
        ) : null}
        {mainContent}
      </div>
    </AppShell>
  );
}

const root = document.getElementById("root");
if (root) {
  if (window.location.pathname === "/auth/callback") {
    import("./auth/callback-page").then(({ AuthCallbackPage }) => {
      createRoot(root).render(<AuthCallbackPage />);
    });
  } else {
    void initBrowserObservability();
    createRoot(root).render(<App />);
  }
}
