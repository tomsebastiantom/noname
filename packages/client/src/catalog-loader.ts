import type { ComponentRegistry } from "@json-render/react";
import { loadRemote, registerRemotes } from "@module-federation/runtime";
import {
  type ExtensionActionHandlerFactory,
  type ExtensionLifecycle,
  extensionLoaders,
} from "@noname/extensions";
import { LOGIN_EVENT } from "./auth/session";
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
  /** Publishable key for anonymous storefront access. Public by design. */
  publishableKey?: string | null;
  private?: CatalogManifestRemote;
  marketplace?: CatalogManifestRemote[];
}

export interface LoadedCatalogs {
  registry: ComponentRegistry;
  actionHandlerFactories: ExtensionActionHandlerFactory[];
}

let catalogCache: {
  key: string;
  registry: ComponentRegistry;
  actionHandlerFactories: ExtensionActionHandlerFactory[];
  lifecycles: Array<{ name: string; onLogin: () => void }>;
} | null = null;

/** Stable fingerprint for catalog manifest change detection (admin soft-nav refresh). */
export function manifestFingerprint(manifest: CatalogManifest): string {
  return manifestCacheKey(manifest);
}

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

type NamedRegistry = { name: string; registry: ComponentRegistry };

function mergeRegistries(registries: NamedRegistry[]): ComponentRegistry {
  if (registries.length === 1) return registries[0]!.registry;

  const merged: ComponentRegistry = {};
  const sourceByKey = new Map<string, string>();

  for (const { name, registry } of registries) {
    for (const key of Object.keys(registry)) {
      if (merged[key]) {
        // Commerce intentionally supplies listing-aware Pagination in place of shadcn's generic
        // control. Keep that precedence for existing saved storefront specs without a false alarm.
        const intentionalCommercePagination =
          key === "Pagination" && sourceByKey.get(key) === "platform" && name === "commerce";
        if (!intentionalCommercePagination) {
          console.warn(`[catalog-loader] component "${key}" overwritten by later registry`);
        }
      }
      merged[key] = registry[key]!;
      sourceByKey.set(key, name);
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

/** Extensions whose lifecycle hooks are already wired (dedup across reloads). */
const wiredLifecycle = new Set<string>();

/**
 * Platform-owned wiring for extension lifecycle callbacks. Domains declare
 * (`ExtensionLifecycle`), the loader subscribes once — no window code in domains.
 */
function wireExtensionLifecycle(name: string, lifecycle?: ExtensionLifecycle): void {
  if (!lifecycle?.onLogin || wiredLifecycle.has(name) || typeof window === "undefined") return;
  wiredLifecycle.add(name);
  const onLogin = lifecycle.onLogin;
  window.addEventListener(LOGIN_EVENT, () => onLogin());
}

async function loadExtensionRegistries(extensions: string[]): Promise<{
  registries: NamedRegistry[];
  actionHandlerFactories: ExtensionActionHandlerFactory[];
  lifecycles: Array<{ name: string; onLogin: () => void }>;
}> {
  const registries: NamedRegistry[] = [];
  const actionHandlerFactories: ExtensionActionHandlerFactory[] = [];
  const lifecycles: Array<{ name: string; onLogin: () => void }> = [];

  for (const name of extensions) {
    const loader = extensionLoaders[name];
    if (!loader) continue;
    try {
      const mod = await loader();
      registries.push({ name, registry: mod.registry });
      if (mod.handlers) actionHandlerFactories.push(mod.handlers);
      if (mod.lifecycle?.onLogin) {
        lifecycles.push({ name, onLogin: mod.lifecycle.onLogin });
      }
    } catch (err) {
      console.error(`[catalog-loader] failed to load extension "${name}":`, err);
    }
  }

  return { registries, actionHandlerFactories, lifecycles };
}

export async function loadCatalogs(manifest: CatalogManifest): Promise<LoadedCatalogs> {
  const cacheKey = manifestCacheKey(manifest);
  if (catalogCache?.key === cacheKey) {
    for (const lifecycle of catalogCache.lifecycles) {
      wireExtensionLifecycle(lifecycle.name, lifecycle);
    }
    return {
      registry: catalogCache.registry,
      actionHandlerFactories: catalogCache.actionHandlerFactories,
    };
  }

  initMfRuntime();

  const {
    registries: extensionRegistries,
    actionHandlerFactories,
    lifecycles,
  } = await loadExtensionRegistries(manifest.extensions ?? []);
  const registries: NamedRegistry[] = [
    { name: "platform", registry: platformRegistry },
    ...extensionRegistries,
  ];

  const marketplace = manifest.marketplace ?? [];
  const marketplaceRegistries = await Promise.all(
    marketplace.map((pkg) => loadRemoteRegistry(pkg.name, pkg.url, "marketplace")),
  );
  for (const [index, registry] of marketplaceRegistries.entries()) {
    if (registry) {
      registries.push({ name: marketplace[index]!.name, registry });
    }
  }

  if (manifest.private) {
    const { name, url } = manifest.private;
    const registry = await loadRemoteRegistry(name, url, name);
    if (registry) registries.push({ name, registry });
  }

  for (const lifecycle of lifecycles) {
    wireExtensionLifecycle(lifecycle.name, lifecycle);
  }

  const registry = mergeRegistries(registries);
  catalogCache = { key: cacheKey, registry, actionHandlerFactories, lifecycles };
  return { registry, actionHandlerFactories };
}

/** Clear memoized catalog (tests or hot reload). */
export function resetCatalogCache(): void {
  catalogCache = null;
}
