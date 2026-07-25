import "./index.css";
import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadOidcConfig } from "./auth/config";
import { apiHeaders, clearSession, hydrateTokenFromCookie, isLoggedIn } from "./auth/session";
import { type CatalogManifest, loadCatalogs } from "./catalog-loader";
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
  return "home";
}

function AuthBar({ onAuthChange }: Readonly<{ onAuthChange: () => void }>) {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [oidcReady, setOidcReady] = useState<boolean | null>(null);
  const onLoginPage = window.location.pathname === "/login";

  useEffect(() => {
    hydrateTokenFromCookie();
    setLoggedIn(isLoggedIn());
    void loadOidcConfig().then((cfg) => setOidcReady(cfg !== null));
  }, []);

  if (onLoginPage || oidcReady === false) {
    return null;
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        gap: 12,
        padding: "8px 16px",
        background: "#f3f4f6",
        fontSize: 14,
      }}
    >
      {loggedIn ? (
        <>
          <span>Signed in</span>
          <button
            type="button"
            onClick={() => {
              clearSession();
              setLoggedIn(false);
              onAuthChange();
              window.location.href = "/login";
            }}
          >
            Sign out
          </button>
        </>
      ) : (
        <a href="/login" style={{ color: "#111827" }}>
          Sign in
        </a>
      )}
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
    return <div style={{ padding: 48, textAlign: "center" }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: 48, textAlign: "center", color: "red" }}>Error: {error}</div>;
  }

  if (!spec || !orgId) {
    return <div style={{ padding: 48, textAlign: "center" }}>No spec found</div>;
  }

  return (
    <div className={template === "login" ? "noname-auth flex min-h-screen flex-col" : undefined}>
      <AuthBar onAuthChange={() => void loadPage()} />
      <JSONUIProvider registry={registry}>
        <Renderer spec={spec} registry={registry} />
      </JSONUIProvider>
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
