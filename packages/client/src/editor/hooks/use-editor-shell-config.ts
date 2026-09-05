import type { Spec } from "@json-render/core";
import { useMemo } from "react";
import { mergeShellRuntimeConfig } from "./editor-session";
import { parseShellFromSpec, useEditorShell } from "./use-editor-shell-labels";

/** Shell label/config resolution for the edit page: edge shell preferred, client fetch fallback. */
export function useEditorShellConfig({
  shellSpecFromEdge,
  templateName,
  pageContentRef,
}: Readonly<{
  shellSpecFromEdge?: Spec | null;
  templateName: string;
  pageContentRef: string | null;
}>) {
  const {
    spec: fetchedShellSpec,
    labels: fetchedShellLabels,
    missing: fetchedShellMissing,
    loading: shellLabelsLoading,
  } = useEditorShell({ skip: Boolean(shellSpecFromEdge) });

  const shellSpec = shellSpecFromEdge ?? fetchedShellSpec;
  const parsedShell = parseShellFromSpec(shellSpec);
  const shellLabels = shellSpecFromEdge ? parsedShell.labels : fetchedShellLabels;
  const shellLabelsMissing = shellSpecFromEdge ? !parsedShell.labels : fetchedShellMissing;

  const mergedShellSpec = useMemo(() => {
    if (!shellSpec) return null;
    return mergeShellRuntimeConfig(shellSpec, { templateName, pageContentRef });
  }, [shellSpec, templateName, pageContentRef]);

  const labelsMissingMessage = useMemo(() => {
    if (shellLabels?.labelsMissingHint) return shellLabels.labelsMissingHint;
    if (!shellSpec?.root) return "Editor shell layout missing.";
    const shell = shellSpec.elements[shellSpec.root];
    const hint = (shell?.props as { labelsMissingHint?: string } | undefined)?.labelsMissingHint;
    return hint ?? "Editor shell layout missing or labels invalid.";
  }, [shellLabels, shellSpec]);

  return {
    shellSpec,
    shellLabels,
    shellLabelsMissing,
    shellLabelsLoading,
    mergedShellSpec,
    labelsMissingMessage,
  };
}
