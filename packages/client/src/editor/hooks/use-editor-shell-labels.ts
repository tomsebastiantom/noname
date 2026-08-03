import type { Spec } from "@json-render/core";
import { useEffect, useState } from "react";
import { getLayoutForTemplate } from "../layout-entries";
import {
  type EditorShellLabels,
  editorShellLabelsSchema,
  VISUAL_EDITOR_LAYOUT_TEMPLATE,
} from "../schemas/components";

export type { EditorShellLabels };

export function parseShellFromSpec(spec: Spec | null | undefined): {
  labels: EditorShellLabels | null;
  valid: boolean;
} {
  if (!spec?.root) return { labels: null, valid: false };
  const shell = spec.elements?.[spec.root];
  if (shell?.type !== "VisualEditorShell") return { labels: null, valid: false };
  const parsed = editorShellLabelsSchema.safeParse(
    (shell.props as { labels?: unknown } | undefined)?.labels,
  );
  return { labels: parsed.success ? parsed.data : null, valid: true };
}

export async function loadEditorShellSpec(): Promise<Spec | null> {
  try {
    const row = await getLayoutForTemplate(VISUAL_EDITOR_LAYOUT_TEMPLATE, "default");
    const spec = row?.data?.spec as Spec | undefined;
    const { valid } = parseShellFromSpec(spec ?? null);
    return valid && spec ? spec : null;
  } catch {
    return null;
  }
}

export async function loadEditorShellLabels(): Promise<EditorShellLabels | null> {
  const spec = await loadEditorShellSpec();
  return parseShellFromSpec(spec).labels;
}

export function useEditorShell(options?: { skip?: boolean }): {
  spec: Spec | null;
  labels: EditorShellLabels | null;
  missing: boolean;
  loading: boolean;
} {
  const [spec, setSpec] = useState<Spec | null>(null);
  const [missing, setMissing] = useState(false);
  const skip = options?.skip ?? false;

  useEffect(() => {
    if (skip) return;
    void loadEditorShellSpec().then((loaded) => {
      if (loaded && parseShellFromSpec(loaded).labels) {
        setSpec(loaded);
      } else {
        setMissing(true);
      }
    });
  }, [skip]);

  const labels = spec ? parseShellFromSpec(spec).labels : null;

  return {
    spec,
    labels,
    missing: skip ? false : missing,
    loading: skip ? false : spec === null && !missing,
  };
}

/** @deprecated Prefer useEditorShell */
export function useEditorShellLabels(): {
  labels: EditorShellLabels | null;
  missing: boolean;
  loading: boolean;
} {
  const { labels, missing, loading } = useEditorShell();
  return { labels, missing, loading };
}
