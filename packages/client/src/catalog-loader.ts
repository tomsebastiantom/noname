import type { ComponentRegistry } from "@json-render/react";
import { loadRemote, registerRemotes } from "@module-federation/runtime";
import { extensionLoaders } from "@noname/extensions";
import { initMfRuntime } from "./mf-init";
import { registry as platformRegistry } from "./platform/registry";

export interface CatalogManifestRemote {
  name: string;
  url: string;
  hash: string;
  version: number;
}

export interface CatalogManifest {
  platform: { version: string; hash: string };
  /** Built-in extensions to merge (e.g. "commerce"). Loaded via code-split imports. */
  extensions?: string[];
  private?: CatalogManifestRemote;
  marketplace?: CatalogManifestRemote[];
}

export interface LoadedCatalogs {
  registry: ComponentRegistry;
}

let catalogCache: { key: string; registry: ComponentRegistry } | null = null;

function manifestCacheKey(manifest: CatalogManifest): string {
  const parts = [manifest.platform.hash];
  for (const ext of manifest.extensions ?? []) {
    parts.push(`ext:${ext}`);
  }
  for (const pkg of manifest.marketplace ?? []) {
    parts.push(`${pkg.name}:${pkg.hash}`);
  }
  if (manifest.private) {
    parts.push(`${manifest.private.name}:${manifest.private.hash}`);
  }
  return parts.join("|");
}

function mergeRegistries(registries: ComponentRegistry[]): ComponentRegistry {
  if (registries.length === 1) return registries[0]!;

  const merged: ComponentRegistry = {};

  for (const reg of registries) {
    for (const key of Object.keys(reg)) {
      if (merged[key]) {
        console.warn(`[catalog-loader] component "${key}" overwritten by later registry`);
      }
      merged[key] = reg[key]!;
    }
  }

  return merged;
}

/**
 * Load a single remote's catalog registry. Isolated in its own try/catch so
 * one broken/unreachable remote (e.g. a marketplace extension) can't crash
 * the entire storefront load — it's simply omitted from the merged registry.
 */
async function loadRemoteRegistry(
  name: string,
  url: string,
  shareScope: string,
): Promise<ComponentRegistry | null> {
  try {
    registerRemotes([{ name, entry: url, shareScope }]);
    const mod = await loadRemote<{ registry: ComponentRegistry }>(`${name}/catalog`);
    return mod?.registry ?? null;
  } catch (err) {
    console.error(`[catalog-loader] failed to load remote "${name}" from ${url}:`, err);
    return null;
  }
}

async function loadExtensionRegistries(extensions: string[]): Promise<ComponentRegistry[]> {
  const registries: ComponentRegistry[] = [];

  for (const name of extensions) {
    const loader = extensionLoaders[name];
    if (!loader) continue;
    try {
      const mod = await loader();
      registries.push(mod.registry);
    } catch (err) {
      console.error(`[catalog-loader] failed to load extension "${name}":`, err);
    }
  }

  return registries;
}

export async function loadCatalogs(manifest: CatalogManifest): Promise<LoadedCatalogs> {
  const cacheKey = manifestCacheKey(manifest);
  if (catalogCache?.key === cacheKey) {
    return { registry: catalogCache.registry };
  }

  initMfRuntime();

  const extensionRegistries = await loadExtensionRegistries(manifest.extensions ?? []);
  const registries: ComponentRegistry[] = [platformRegistry, ...extensionRegistries];

  const marketplace = manifest.marketplace ?? [];
  const marketplaceRegistries = await Promise.all(
    marketplace.map((pkg) => loadRemoteRegistry(pkg.name, pkg.url, "marketplace")),
  );
  for (const registry of marketplaceRegistries) {
    if (registry) registries.push(registry);
  }

  if (manifest.private) {
    const { name, url } = manifest.private;
    const registry = await loadRemoteRegistry(name, url, name);
    if (registry) registries.push(registry);
  }

  const registry = mergeRegistries(registries);
  catalogCache = { key: cacheKey, registry };
  return { registry };
}

/** Clear memoized catalog (tests or hot reload). */
export function resetCatalogCache(): void {
  catalogCache = null;
}
