import { registerRemotes, loadRemote } from "@module-federation/runtime";
import type { ComponentRegistry } from "@json-render/react";
import { registry as platformRegistry } from "./registry";
import { initMfRuntime } from "./mf-init";

export interface CatalogManifestRemote {
  name: string;
  url: string;
  hash: string;
  version: number;
}

export interface CatalogManifest {
  platform: { version: string; hash: string };
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

export async function loadCatalogs(manifest: CatalogManifest): Promise<LoadedCatalogs> {
  initMfRuntime();

  const registries: ComponentRegistry[] = [platformRegistry];

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
