import type { Spec } from "@json-render/core";
import {
  type ComponentRegistry,
  createStateStore,
  JSONUIProvider,
  type SetState,
} from "@json-render/react";
import { useDeferredValue, useMemo } from "react";
import { AdminShell } from "../admin/components/shell/AdminShell";
import type { CatalogProps } from "../schemas/shared";
import { mergeAdminShellWithPanelChrome } from "./admin-layout";
import { navigateApp } from "./app-navigation";
import { CatalogUiShell } from "./catalog-ui-shell";
import { handlers as createHandlers } from "./registry";

type AdminShellProps = CatalogProps<Record<string, unknown>, Record<string, unknown>>;

function AdminPanelContent({
  panelSpec,
  panelKey,
  registry,
}: Readonly<{
  panelSpec: Spec | null;
  panelKey: string;
  registry: ComponentRegistry;
}>) {
  const deferredSpec = useDeferredValue(panelSpec);
  const deferredKey = useDeferredValue(panelKey);
  const isStale = deferredSpec !== panelSpec;

  if (!deferredSpec) return null;

  return (
    <div className="relative min-h-[12rem]">
      {isStale ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-primary/70"
          aria-hidden
        />
      ) : null}
      <CatalogUiShell key={deferredKey} spec={deferredSpec} registry={registry} />
    </div>
  );
}

/**
 * Stable admin chrome + keyed panel. Sidebar stays mounted; panel swaps use
 * deferred values so the previous screen stays visible until the next is ready.
 */
export function AdminPlatformView({
  baseShellProps,
  panelSpec,
  panelKey,
  registry,
}: Readonly<{
  baseShellProps: AdminShellProps;
  panelSpec: Spec | null;
  panelKey: string;
  registry: ComponentRegistry;
}>) {
  const deferredPanelSpec = useDeferredValue(panelSpec);
  const shellStore = useMemo(() => createStateStore({}), []);
  const shellHandlers = useMemo(
    () =>
      createHandlers(
        () => shellStore.set.bind(shellStore) as unknown as SetState,
        () => shellStore.getSnapshot(),
      ),
    [shellStore],
  );
  const navigate = useMemo(() => (path: string) => navigateApp(path), []);

  const shellProps = useMemo(
    () => mergeAdminShellWithPanelChrome(baseShellProps, deferredPanelSpec),
    [baseShellProps, deferredPanelSpec],
  );

  return (
    <JSONUIProvider
      registry={registry}
      store={shellStore}
      handlers={shellHandlers}
      navigate={navigate}
    >
      <AdminShell props={shellProps as never} emit={() => {}}>
        <AdminPanelContent panelSpec={panelSpec} panelKey={panelKey} registry={registry} />
      </AdminShell>
    </JSONUIProvider>
  );
}
