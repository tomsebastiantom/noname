import type { Spec } from "@json-render/core";
import {
  type ComponentRegistry,
  createStateStore,
  JSONUIProvider,
  Renderer,
  type SetState,
} from "@json-render/react";
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
}: Readonly<{
  spec: Spec;
  registry: ComponentRegistry;
}>) {
  const flags = useSyncExternalStore(subscribeFlags, getFlagsSnapshot, getFlagsSnapshot);
  const store = useMemo(() => createStateStore({}), []);

  const actionHandlers = useMemo(
    () =>
      createHandlers(
        () => store.set.bind(store) as unknown as SetState,
        () => store.getSnapshot(),
      ),
    [store],
  );

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
