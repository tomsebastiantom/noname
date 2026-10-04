import type { Spec } from "@json-render/core";
import {
  type ComponentRegistry,
  createStateStore,
  JSONUIProvider,
  Renderer,
  type SetState,
} from "@json-render/react";
import type { ExtensionActionHandlerFactory } from "@noname/extensions";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { navigateApp } from "./app-navigation";
import { getFlagsSnapshot, subscribeFlags } from "./browser-observability";
import { handlers as createHandlers } from "./registry";

/**
 * Renders a layout spec with json-render providers and catalog action handlers.
 *
 * Handlers must be passed synchronously via `JSONUIProvider handlers={…}` (dashboard
 * example). registerHandler in useEffect runs too late — child useEffects fire in
 * the same tick before handler state commits.
 *
 * Parent must pass `key={routeKey}` so each platform route gets a fresh store and
 * ActionProvider mount (ActionProvider only reads handlers from props on first mount).
 *
 * Feature flags mirror into state at `/flags/{key}` so specs can use:
 * `"visible": { "$state": "/flags/show_summer_sale" }`
 *
 * @see https://github.com/vercel-labs/json-render/blob/main/examples/dashboard/lib/render/renderer.tsx
 */
export function CatalogUiShell({
  spec,
  registry,
  actionHandlerFactories = [],
}: Readonly<{
  spec: Spec;
  registry: ComponentRegistry;
  actionHandlerFactories?: ExtensionActionHandlerFactory[];
}>) {
  const flags = useSyncExternalStore(subscribeFlags, getFlagsSnapshot, getFlagsSnapshot);
  const store = useMemo(() => createStateStore({}), []);

  const actionHandlers = useMemo(() => {
    const getState = () => store.getSnapshot();
    const getPathSetState = () => store.set.bind(store) as unknown as SetState;
    const handlers = createHandlers(getPathSetState, getState);
    const getUpdaterSetState =
      () => (updater: (previous: Record<string, unknown>) => Record<string, unknown>) => {
        const previous = store.getSnapshot() as Record<string, unknown>;
        const next = updater(previous);
        const updates: Record<string, unknown> = {};
        const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
        for (const key of keys) {
          if (previous[key] !== next[key]) {
            const escapedKey = key.replace(/~/g, "~0").replace(/\//g, "~1");
            updates[`/${escapedKey}`] = next[key];
          }
        }
        if (Object.keys(updates).length > 0) store.update(updates);
      };
    for (const createExtensionHandlers of actionHandlerFactories) {
      Object.assign(handlers, createExtensionHandlers(getUpdaterSetState, getState));
    }
    return handlers;
  }, [store, actionHandlerFactories]);

  const navigate = useMemo(() => (path: string) => navigateApp(path), []);

  useEffect(() => {
    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(flags)) {
      updates[`/flags/${key}`] = value;
    }
    if (Object.keys(updates).length > 0) {
      store.update(updates);
    }
  }, [flags, store]);

  return (
    <JSONUIProvider registry={registry} store={store} handlers={actionHandlers} navigate={navigate}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}
