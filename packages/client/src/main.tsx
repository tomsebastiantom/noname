import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Renderer } from "@json-render/react";
import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { registry as platformRegistry } from "./registry";
import { loadCatalogs, type CatalogManifest } from "./catalog-loader";

function App() {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [registry, setRegistry] = useState<ComponentRegistry>(platformRegistry);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const siteId = window.location.hostname.split(".")[0] || "default";

    const manifestPromise = fetch(`/api/tenants/${siteId}/catalog`)
      .then((res) => (res.ok ? (res.json() as Promise<CatalogManifest>) : null))
      .catch(() => null);

    const specPromise = fetch(`/api/edge/schema/${siteId}?segment=default`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ data?: Spec }>;
      })
      .catch((err: Error) => {
        throw err;
      });

    Promise.all([manifestPromise, specPromise])
      .then(async ([manifest, data]) => {
        const tree = data?.data as Spec;
        if (!tree) throw new Error("No spec returned");

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

  return <Renderer spec={spec} registry={registry} />;
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
