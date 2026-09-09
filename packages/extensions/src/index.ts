import type { ComponentRegistry } from "@json-render/react";

/**
 * Platform-owned lifecycle surface for extensions. The loader (platform)
 * subscribes these once per loaded extension — domains only declare
 * callbacks, never touch window events themselves.
 */
export interface ExtensionLifecycle {
  /** Runs on fresh login (platform fires `noname:login` from setSessionToken). */
  onLogin?: () => void;
}

export interface ExtensionModule {
  registry: ComponentRegistry;
  componentSchemas?: Record<string, unknown>;
  actionSchemas?: Record<string, unknown>;
  lifecycle?: ExtensionLifecycle;
}

export type ExtensionLoader = () => Promise<ExtensionModule>;

/** Built-in extensions. Client merges only those listed in org manifest. */
export const extensionLoaders: Record<string, ExtensionLoader> = {
  commerce: () => import("./commerce/registry"),
};

export const KNOWN_EXTENSIONS = Object.keys(extensionLoaders);
