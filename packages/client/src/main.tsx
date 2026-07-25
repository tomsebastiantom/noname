import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { loadOidcConfig } from "./auth/config";
import {
  apiHeaders,
  clearSession,
  handleCallback,
  hydrateTokenFromCookie,
  isLoggedIn,
  startLogin,
} from "./auth/pkce";
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

function AuthBar({
  orgId,
  onAuthChange,
}: Readonly<{ orgId: string; onAuthChange: () => void }>) {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [oidcReady, setOidcReady] = useState<boolean | null>(null);

  useEffect(() => {
    hydrateTokenFromCookie();
    setLoggedIn(isLoggedIn());
    void loadOidcConfig().then((cfg) => setOidcReady(cfg !== null));
  }, []);

  if (oidcReady === false) {
    return (
      <div style={{ padding: "8px 16px", background: "#fef3c7", fontSize: 14 }}>
        Run <code>pnpm init:zitadel</code> to enable sign-in.
      </div>
    );
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
            }}
          >
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => {
            void startLogin(orgId);
          }}
        >
          Sign in
        </button>
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

  const loadStore = useCallback(async () => {
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

    const specPromise = fetch(`/api/edge/schema/${orgId}?segment=default`, { headers }).then(
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
  }, [orgId]);

  useEffect(() => {
    void loadStore();
  }, [loadStore]);

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
    <>
      <AuthBar orgId={orgId} onAuthChange={() => void loadStore()} />
      <JSONUIProvider registry={registry}>
        <Renderer spec={spec} registry={registry} />
      </JSONUIProvider>
    </>
  );
}

function CallbackError({ message }: Readonly<{ message: string }>) {
  return (
    <div style={{ padding: 48, textAlign: "center", color: "red" }}>
      Sign-in failed: {message}
    </div>
  );
}

const root = document.getElementById("root");
if (root) {
  if (window.location.pathname === "/callback") {
    try {
      const returnUrl = await handleCallback();
      window.location.replace(returnUrl);
    } catch (err) {
      createRoot(root).render(
        <CallbackError message={err instanceof Error ? err.message : String(err)} />,
      );
    }
  } else {
    createRoot(root).render(<App />);
  }
}
