import "./index.css";
import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { storeSlugFromHostname } from "./auth/org";
import { apiHeaders, hydrateTokenFromCookie, isLoggedIn } from "./auth/session";
import { type CatalogManifest, loadCatalogs } from "./catalog-loader";
import { AuthBar } from "./core/components/AuthBar";
import { isLoginTemplate, resolveRoute } from "./platform-routes";
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
  const [registry, setRegistry] = useState<ComponentRegistry>(platformRegistry);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const storeSlug = storeSlugFromHostname(window.location.hostname);

  const pathname = window.location.pathname;
  const route = resolveRoute(pathname);
  const platformRoute = route.kind === "platform";
  const template = platformRoute ? route.template : "storefront";
  const adminRoute = platformRoute && route.requiresAuth;

  const loadPage = useCallback(async () => {
    hydrateTokenFromCookie();

    if (!storeSlug) {
      setError("Use {slug}.localhost:5173 — e.g. yogastore.localhost:5173 (run pnpm seed:demo)");
      setLoading(false);
      return;
    }

    if (adminRoute && !isLoggedIn()) {
      const redirect = encodeURIComponent(window.location.pathname);
      window.location.href = `/login?redirect=${redirect}`;
      return;
    }

    setLoading(true);
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
      const tree = body?.data?.layout as Spec | undefined;
      if (!tree) throw new Error("No layout spec returned");

      if (manifest) {
        const loaded = await loadCatalogs(manifest);
        setRegistry(loaded.registry);
      }

      setSpec(tree);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [storeSlug, template, adminRoute, platformRoute, pathname]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  if (loading) {
    return (
      <AppShell template={template}>
        <div className="flex flex-1 items-center justify-center p-12 text-muted-foreground">
          Loading…
        </div>
      </AppShell>
    );
  }

  if (error) {
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
      {!adminRoute && <AuthBar onAuthChange={() => void loadPage()} />}
      <JSONUIProvider registry={registry}>
        <Renderer spec={spec} registry={registry} />
      </JSONUIProvider>
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
    createRoot(root).render(<App />);
  }
}
