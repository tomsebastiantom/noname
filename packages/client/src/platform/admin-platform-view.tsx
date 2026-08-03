import type { Spec } from "@json-render/core";
import {
  type ComponentRegistry,
  createStateStore,
  JSONUIProvider,
  type SetState,
} from "@json-render/react";
import { useMemo } from "react";
import { AdminShell } from "../admin/components/shell/AdminShell";
import type { CatalogProps } from "../schemas/shared";
import { navigateApp } from "./app-navigation";
import { CatalogUiShell } from "./catalog-ui-shell";
import { handlers as createHandlers } from "./registry";

type AdminShellProps = CatalogProps<Record<string, unknown>, Record<string, unknown>>;

function AdminPanelContent({
  panelLoading,
  panelSpec,
  panelKey,
  registry,
}: Readonly<{
  panelLoading: boolean;
  panelSpec: Spec | null;
  panelKey: string;
  registry: ComponentRegistry;
}>) {
  if (panelLoading) {
    return <p className="text-muted-foreground">Loading…</p>;
  }
  if (!panelSpec) return null;
  return <CatalogUiShell key={panelKey} spec={panelSpec} registry={registry} />;
}

/**
 * Stable admin chrome + keyed panel. Sidebar/header stay mounted; only the inner
 * CatalogUiShell remounts per layout template (fresh store + MountActions).
 */
export function AdminPlatformView({
  shellProps,
  panelSpec,
  panelKey,
  panelLoading,
  registry,
}: Readonly<{
  shellProps: AdminShellProps;
  panelSpec: Spec | null;
  panelKey: string;
  panelLoading: boolean;
  registry: ComponentRegistry;
}>) {
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

  return (
    <JSONUIProvider
      registry={registry}
      store={shellStore}
      handlers={shellHandlers}
      navigate={navigate}
    >
      <AdminShell props={shellProps as never} emit={() => {}}>
        <AdminPanelContent
          panelLoading={panelLoading}
          panelSpec={panelSpec}
          panelKey={panelKey}
          registry={registry}
        />
      </AdminShell>
    </JSONUIProvider>
  );
}
