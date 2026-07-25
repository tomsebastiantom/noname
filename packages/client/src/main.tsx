import "./index.css";
import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { apiHeaders, hydrateTokenFromCookie } from "./auth/session";
import { type CatalogManifest, loadCatalogs } from "./catalog-loader";
import { AuthBar } from "./core/components/AuthBar";
import { registry as platformRegistry } from "./registry";

interface EdgeSchemaResponse {
  siteId?: string;
  layout?: Spec;
  flags?: Record<string, unknown>;
  segment?: string;
}

/** ZITADEL org id from subdomain, e.g. 383371762538184712.localhost → that org */
function orgIdFromHostname(hostname: string): string | null {
  const sub = hostname.split(".")[0];
  if (!sub || sub === "localhost" || sub === "127") return null;
  return sub;
}

function templateFromPath(pathname: string): string {
  if (pathname === "/login") return "login";
  if (pathname === "/auth/callback") return "login";
  return "home";
}

function AppShell({ children, template }: Readonly<{ children: ReactNode; template: string }>) {
  return (
    <div
      className={
        template === "login"
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

  const orgId = orgIdFromHostname(window.location.hostname);
  const template = templateFromPath(window.location.pathname);

  const loadPage = useCallback(async () => {
    hydrateTokenFromCookie();

    if (!orgId) {
      setError(
        "Use {orgId}.localhost:5173 — org id is the ZITADEL org (see ZITADEL_DEMO_ORG_ID in .env after pnpm init:zitadel)",
      );
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const headers = apiHeaders();

    const manifestPromise = fetch(`/api/tenants/${orgId}/catalog`, { headers })
      .then((res) => (res.ok ? (res.json() as Promise<{ data: CatalogManifest }>) : null))
      .then((body) => body?.data ?? null)
      .catch(() => null);

    const specPromise = fetch(
      `/api/edge/schema/${orgId}?segment=default&template=${encodeURIComponent(template)}`,
      { headers },
    ).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ data?: EdgeSchemaResponse }>;
    });

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
  }, [orgId, template]);

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

  if (!spec || !orgId) {
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
      <AuthBar onAuthChange={() => void loadPage()} />
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
