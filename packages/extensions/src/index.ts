import type { ComponentRegistry } from "@json-render/react";

export type ExtensionLoader = () => Promise<{ registry: ComponentRegistry }>;

/** Built-in extensions. Client merges only those listed in org manifest. */
export const extensionLoaders: Record<string, ExtensionLoader> = {
  commerce: () => import("./commerce/registry"),
};

export const KNOWN_EXTENSIONS = Object.keys(extensionLoaders);
