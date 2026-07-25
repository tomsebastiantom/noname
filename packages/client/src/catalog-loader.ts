import type { ComponentRegistry } from "@json-render/react";
import { loadRemote, registerRemotes } from "@module-federation/runtime";
import { extensionLoaders } from "@noname/extensions";
import { initMfRuntime } from "./mf-init";
import { registry as platformRegistry } from "./registry";

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

function mergeRegistries(registries: ComponentRegistry[]): ComponentRegistry {
  if (registries.length === 1) return registries[0]!;

  const merged: ComponentRegistry = {};

  for (const reg of registries) {
    for (const key of Object.keys(reg)) {
      merged[key] = reg[key]!;
    }
  }

  return merged;
}

async function loadExtensionRegistries(extensions: string[]): Promise<ComponentRegistry[]> {
  const registries: ComponentRegistry[] = [];

  for (const name of extensions) {
    const loader = extensionLoaders[name];
    if (loader) {
      const mod = await loader();
      registries.push(mod.registry);
    }
  }

  return registries;
}

export async function loadCatalogs(manifest: CatalogManifest): Promise<LoadedCatalogs> {
  initMfRuntime();

  const extensionRegistries = await loadExtensionRegistries(manifest.extensions ?? []);
  const registries: ComponentRegistry[] = [platformRegistry, ...extensionRegistries];

  const marketplace = manifest.marketplace ?? [];
  for (const pkg of marketplace) {
    registerRemotes([
      {
        name: pkg.name,
        entry: pkg.url,
        shareScope: "marketplace",
      },
    ]);
    const mod = await loadRemote<{ registry: ComponentRegistry }>(`${pkg.name}/catalog`);
    if (mod?.registry) {
      registries.push(mod.registry);
    }
  }

  if (manifest.private) {
    const { name, url } = manifest.private;
    registerRemotes([
      {
        name,
        entry: url,
        shareScope: name,
      },
    ]);
    const mod = await loadRemote<{ registry: ComponentRegistry }>(`${name}/catalog`);
    if (mod?.registry) {
      registries.push(mod.registry);
    }
  }

  return { registry: mergeRegistries(registries) };
}
