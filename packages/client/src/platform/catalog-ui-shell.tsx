import type { Spec } from "@json-render/core";
import {
  type ComponentRegistry,
  createStateStore,
  JSONUIProvider,
  Renderer,
  type SetState,
} from "@json-render/react";
import { useMemo } from "react";
import { navigateApp } from "./app-navigation";
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
 * @see https://github.com/vercel-labs/json-render/blob/main/examples/dashboard/lib/render/renderer.tsx
 */
export function CatalogUiShell({
  spec,
  registry,
}: Readonly<{
  spec: Spec;
  registry: ComponentRegistry;
}>) {
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

  return (
    <JSONUIProvider registry={registry} store={store} handlers={actionHandlers} navigate={navigate}>
      <Renderer spec={spec} registry={registry} />
    </JSONUIProvider>
  );
}
