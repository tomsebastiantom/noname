import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { JSONUIProvider, Renderer } from "@json-render/react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { type CatalogManifest, loadCatalogs } from "./catalog-loader";
import { resolveSiteId } from "./demo-tenant";
import { registry as platformRegistry } from "./registry";

interface EdgeSchemaResponse {
  siteId?: string;
  layout?: Spec;
  flags?: Record<string, unknown>;
  segment?: string;
}

function tenantHeaders(tenantId: string): HeadersInit {
  return { "x-tenant-id": tenantId };
}

function App() {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [registry, setRegistry] = useState<ComponentRegistry>(platformRegistry);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const siteId = resolveSiteId(window.location.hostname);

    const manifestPromise = fetch(`/api/tenants/${siteId}/catalog`, {
      headers: tenantHeaders(siteId),
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ data: CatalogManifest }>) : null))
      .then((body) => body?.data ?? null)
      .catch(() => null);

    const specPromise = fetch(`/api/edge/schema/${siteId}?segment=default`, {
      headers: tenantHeaders(siteId),
    }).then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ data?: EdgeSchemaResponse }>;
    });

    Promise.all([manifestPromise, specPromise])
      .then(async ([manifest, body]) => {
        const tree = body?.data?.layout as Spec | undefined;
        if (!tree) throw new Error("No layout spec returned");

        if (manifest) {
          const loaded = await loadCatalogs(manifest);
          setRegistry(loaded.registry);
        }

        setSpec(tree);
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <div style={{ padding: 48, textAlign: "center" }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: 48, textAlign: "center", color: "red" }}>Error: {error}</div>;
  }

  if (!spec) {
    return <div style={{ padding: 48, textAlign: "center" }}>No spec found</div>;
  }

  return (
    <JSONUIProvider registry={registry}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
