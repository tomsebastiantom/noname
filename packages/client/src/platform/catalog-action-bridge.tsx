import { type SetState, useActions, useStateStore } from "@json-render/react";
import { useEffect, useRef } from "react";
import { handlers as createHandlers } from "./registry";

/**
 * Binds defineRegistry action handlers to the live json-render state store.
 *
 * Official json-render pattern (dashboard example):
 * https://github.com/vercel-labs/json-render/blob/main/examples/dashboard/lib/render/renderer.tsx
 *
 * `handlers(getSetState, getState)` needs live store accessors. Those only exist
 * inside `JSONUIProvider`, so we register via `registerHandler` after mount —
 * same result as `ActionProvider handlers={…}` in the dashboard app.
 */
export function CatalogActionBridge() {
  const { set, getSnapshot } = useStateStore();
  const { registerHandler } = useActions();

  // Refs so handler closures always read the latest store (dashboard pattern).
  const setRef = useRef(set);
  const getStateRef = useRef(getSnapshot);
  setRef.current = set;
  getStateRef.current = getSnapshot;

  useEffect(() => {
    const bound = createHandlers(
      // json-render types SetState as a React updater, but StateStore.set is
      // path-based at runtime — same API the built-in setState action uses.
      () => setRef.current as unknown as SetState,
      () => getStateRef.current(),
    );
    for (const [name, fn] of Object.entries(bound)) {
      registerHandler(name, fn);
    }
  }, [registerHandler]);

  return null;
}
