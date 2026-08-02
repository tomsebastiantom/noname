import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { createContext, type ReactNode, useContext } from "react";
import type { ContentDraftEditor } from "../components/panel/PropsPanel";
import type { LayerReorderPlacement } from "../lib/spec-utils";
import type { EditSelection, PendingBlockAdd } from "../lib/types";
import type { EditorShellLabels } from "../schemas/components";

export type EditorSessionValue = {
  templateName: string;
  pageContentRef: string | null;
  registry: ComponentRegistry;
  shellLabels: EditorShellLabels;
  previewSpec: Spec;
  storedSpec: Spec | null;
  selection: EditSelection | null;
  pendingAdd: PendingBlockAdd | null;
  contentDraft: ContentDraftEditor;
  dirty: boolean;
  draftStatus: string | null;
  canPublish: boolean;
  chromeError: string | null;
  saveSuccess: string | null;
  saveConflict: boolean;
  canUndo: boolean;
  canRedo: boolean;
  setSelection: (selection: EditSelection | null) => void;
  stageAdd: (componentType: string, parentId?: string, insertIndex?: number) => void;
  handleStoredChange: (next: Spec) => void;
  patchPendingProps: (fieldPath: string, value: unknown) => void;
  handleSave: () => Promise<void>;
  handlePublish: () => Promise<void>;
  handleDiscard: () => void;
  handleRefreshConflict: () => void;
  undo: () => void;
  redo: () => void;
  exitEditMode: () => void;
  cancelPendingAdd: () => void;
  handleDelete: (elementId: string) => void;
  handleDuplicate: (elementId: string) => void;
  handleReorder: (elementId: string, targetId: string, placement: LayerReorderPlacement) => void;
  isStoredElement: (elementId: string) => boolean;
};

const EditorSessionContext = createContext<EditorSessionValue | null>(null);

export function EditorSessionProvider({
  value,
  children,
}: {
  value: EditorSessionValue;
  children: ReactNode;
}) {
  return <EditorSessionContext.Provider value={value}>{children}</EditorSessionContext.Provider>;
}

export function useEditorSession(): EditorSessionValue {
  const ctx = useContext(EditorSessionContext);
  if (!ctx) {
    throw new Error("useEditorSession must be used within EditorSessionProvider");
  }
  return ctx;
}

/** Merge runtime page context into the loaded visual_editor shell spec. */
export function mergeShellRuntimeConfig(
  spec: Spec,
  config: { templateName: string; pageContentRef: string | null },
): Spec {
  const root = spec.root;
  const shell = spec.elements[root];
  if (!shell) return spec;

  const props = (shell.props ?? {}) as {
    config?: Record<string, unknown>;
    labels?: Record<string, unknown>;
  };

  return {
    ...spec,
    elements: {
      ...spec.elements,
      [root]: {
        ...shell,
        props: {
          ...props,
          config: {
            ...props.config,
            templateName: config.templateName,
            pageContentRef: config.pageContentRef,
          },
        },
      },
    },
  };
}
