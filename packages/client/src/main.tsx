import "./index.css";
import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { storeSlugFromHostname } from "./auth/org";
import { apiHeaders, hydrateTokenFromCookie, isLoggedIn } from "./auth/session";
import { fetchAuthSessionStatus, sessionCanDraft } from "./auth/team-users";
import { type CatalogManifest, loadCatalogs } from "./catalog-loader";
import { AuthBar } from "./core/components/AuthBar";
import { getPathname, subscribeAppLocation } from "./platform/app-navigation";
import { CatalogUiShell } from "./platform/catalog-ui-shell";
import {
  initBrowserObservability,
  syncBrowserObservabilityContext,
} from "./platform/browser-observability";
import { isAdminTemplate, isLoginTemplate, resolveRoute } from "./platform-routes";
import { registry as platformRegistry } from "./registry";

interface EdgeSchemaResponse {
  siteId?: string;
  layout?: Spec;
  flags?: Record<string, unknown>;
  segment?: string;
}

function AppShell({ children, template }: Readonly<{ children: ReactNode; template: string }>) {
  return (
    <div
      className={
        isLoginTemplate(template)
          ? "noname-auth flex min-h-screen flex-col"
          : "min-h-screen bg-background"
      }
    >
      {children}
    </div>
  );
}

function App() {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [routeKey, setRouteKey] = useState("");
  const [registry, setRegistry] = useState<ComponentRegistry>(platformRegistry);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const specRef = useRef<Spec | null>(null);
  specRef.current = spec;
  const loadSeqRef = useRef(0);
  const storeSlug = storeSlugFromHostname(window.location.hostname);

  const pathname = useSyncExternalStore(subscribeAppLocation, getPathname, getPathname);
  const route = resolveRoute(pathname);
  const platformRoute = route.kind === "platform";
  const template = platformRoute ? route.template : "storefront";
  const adminRoute = platformRoute && route.requiresAuth;
  const editMode = new URLSearchParams(window.location.search).get("edit") === "true";

  const loadPage = useCallback(async () => {
    const loadSeq = ++loadSeqRef.current;
    const isStale = () => loadSeq !== loadSeqRef.current;

    hydrateTokenFromCookie();

    if (!storeSlug) {
      setError("Use {slug}.localhost:5173 — e.g. yogastore.localhost:5173 (run pnpm seed:demo)");
      setLoading(false);
      setNavigating(false);
      return;
    }

    if ((adminRoute || editMode) && !isLoggedIn()) {
      const redirect = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?redirect=${redirect}`;
      return;
    }

    if ((adminRoute || editMode) && isLoggedIn()) {
      try {
        const session = await fetchAuthSessionStatus();
        if (editMode && !sessionCanDraft(session)) {
          const url = new URL(window.location.href);
          url.searchParams.delete("edit");
          window.location.replace(url.pathname + url.search + url.hash);
          return;
        }
        const needsMfaGate = editMode || pathname.startsWith("/admin");
        if (needsMfaGate && session.requireMfaForAdmin && !session.mfaEnrolled) {
          const redirect = encodeURIComponent(pathname + window.location.search);
          window.location.href = `/account/security?redirect=${redirect}&mfaRequired=1`;
          return;
        }
      } catch {
        // Session check failed — still load page; API calls will 401 if needed.
      }
    }

    const softAdminNav = specRef.current !== null && isAdminTemplate(template);
    if (softAdminNav) {
      setNavigating(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const headers = apiHeaders();

    const manifestPromise = fetch(`/api/tenants/${storeSlug}/catalog`, { headers })
      .then((res) => (res.ok ? (res.json() as Promise<{ data: CatalogManifest }>) : null))
      .then((body) => body?.data ?? null)
      .catch(() => null);

    const schemaQuery = platformRoute
      ? `segment=default&template=${encodeURIComponent(template)}`
      : `segment=default&url=${encodeURIComponent(pathname)}`;

    const specPromise = fetch(`/api/edge/schema/${storeSlug}?${schemaQuery}`, { headers }).then(
      (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ data?: EdgeSchemaResponse }>;
      },
    );

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

      setSpec(tree);
      setRouteKey(`${template}:${pathname}`);

      void syncBrowserObservabilityContext({
        contextHash: body?.data?.segment ?? "default",
      });
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

  if (loading && !spec) {
    return (
      <AppShell template={template}>
        <div className="flex flex-1 items-center justify-center p-12 text-muted-foreground">
          Loading…
        </div>
      </AppShell>
    );
  }

  if (error && !spec) {
    return (
      <AppShell template={template}>
        <div className="flex flex-1 items-center justify-center p-12 text-destructive">
          Error: {error}
        </div>
      </AppShell>
    );
  }

  if (!spec || !storeSlug) {
    return (
      <AppShell template={template}>
        <div className="flex flex-1 items-center justify-center p-12 text-muted-foreground">
          No spec found
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell template={template}>
      {editMode && (
        <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
          Edit mode active — component overlay and save bar ship in the next editor slice.
        </div>
      )}
      {!adminRoute && !editMode && <AuthBar onAuthChange={() => void loadPage()} />}
      {navigating ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center bg-background/40 pt-24">
          <p className="rounded-md border bg-background px-4 py-2 text-sm text-muted-foreground shadow-sm">
            Loading…
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}
      <CatalogUiShell key={routeKey || `${template}:${pathname}`} spec={spec} registry={registry} />
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
