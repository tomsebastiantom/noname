import type { Spec } from "@json-render/core";
import type { CatalogProps } from "../schemas/shared";

const SKIP_PANEL_CHROME = new Set(["MountAction", "Stack"]);

type ShellProps = CatalogProps<Record<string, unknown>, Record<string, unknown>>;

/** Read AdminShell props from a shell layout spec. */
export function adminShellPropsFromSpec(spec: Spec): ShellProps | null {
  const rootEl = spec.elements[spec.root];
  if (rootEl?.type !== "AdminShell") return null;
  return rootEl.props as ShellProps;
}

/** Panel layouts must not include AdminShell — chrome lives in the shell layout. */
export function assertAdminPanelSpec(spec: Spec): Spec {
  const rootEl = spec.elements[spec.root];
  if (rootEl?.type === "AdminShell") {
    throw new Error(
      "Admin panel layout must be panel-only (no AdminShell). Publish chrome in a shell layout.",
    );
  }
  return spec;
}

/** Panel page title/description from the primary panel component. */
export function panelChromeFromSpec(
  spec: Spec,
): { title: string; description?: string | null } | null {
  function visit(key: string): { title: string; description?: string | null } | null {
    const el = spec.elements[key];
    if (!el) return null;
    if (SKIP_PANEL_CHROME.has(el.type)) {
      for (const child of el.children ?? []) {
        const found = visit(child);
        if (found) return found;
      }
      return null;
    }
    const labels = (el.props as { labels?: { title?: string; description?: string | null } })
      ?.labels;
    if (labels?.title) {
      return { title: labels.title, description: labels.description ?? null };
    }
    return null;
  }
  return visit(spec.root);
}

/** Shell nav from shell layout; main header copy from the active panel spec. */
export function mergeAdminShellWithPanelChrome(
  shellProps: ShellProps,
  panelSpec: Spec | null,
): ShellProps {
  if (!panelSpec) return shellProps;
  const chrome = panelChromeFromSpec(panelSpec);
  if (!chrome) return shellProps;
  return {
    ...shellProps,
    labels: {
      ...(shellProps.labels as Record<string, unknown>),
      title: chrome.title,
      ...(chrome.description === undefined ? {} : { description: chrome.description }),
    },
  };
}
