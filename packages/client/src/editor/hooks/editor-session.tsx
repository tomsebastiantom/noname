import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { createContext, type ReactNode, useContext, useMemo, useRef } from "react";
import type { LayoutAgentActivity } from "../collab/collab-peer-display";
import type { CollabPeerPresence } from "../collab/presence";
import type { ContentDraftEditor } from "../components/panel/PropsPanel";
import type { LayerReorderPlacement } from "../lib/spec-utils";
import type { EditSelection, PendingBlockAdd } from "../lib/types";
import type { EditorShellLabels } from "../schemas/components";

export type AgentTargetField = {
  fieldKey: string;
  locale: string;
  fieldLabel: string;
  fieldType: string;
  excerpt?: string;
};

export type EditorSessionData = {
  templateName: string;
  pageContentRef: string | null;
  registry: ComponentRegistry;
  shellLabels: EditorShellLabels;
  previewSpec: Spec;
  storedSpec: Spec | null;
  selection: EditSelection | null;
  pendingAdd: PendingBlockAdd | null;
  contentDraft: ContentDraftEditor;
  agentTargetField: AgentTargetField | null;
  dirty: boolean;
  draftStatus: string | null;
  canPublish: boolean;
  chromeError: string | null;
  saveSuccess: string | null;
  saveConflict: boolean;
  lastActivity: string | null;
  canUndo: boolean;
  canRedo: boolean;
  collabEnabled: boolean;
  collabConnected: boolean;
  collabError: string | null;
  collabPeers: CollabPeerPresence[];
  agentTaskActivity: LayoutAgentActivity | null;
  layoutDocumentId: string | null;
};

export type EditorSessionActions = {
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
  reportCollabPointerMove: (cursorX: number | null, cursorY: number | null) => void;
  reloadLayoutAfterAgentPatch: () => Promise<void>;
  applyAgentRevertedLayoutSpec: (spec: Spec) => void;
};

/** @deprecated Use useEditorSessionData + useEditorSessionActions */
export type EditorSessionValue = EditorSessionData & EditorSessionActions;

const EditorSessionDataContext = createContext<EditorSessionData | null>(null);
const EditorSessionActionsContext = createContext<EditorSessionActions | null>(null);

type EditorSessionProviderProps = {
  data: EditorSessionData;
  actions: EditorSessionActions;
  children: ReactNode;
};

export function EditorSessionProvider({ data, actions, children }: EditorSessionProviderProps) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  const stableActions = useMemo(
    (): EditorSessionActions => ({
      setSelection: (selection) => actionsRef.current.setSelection(selection),
      stageAdd: (type, parentId, insertIndex) =>
        actionsRef.current.stageAdd(type, parentId, insertIndex),
      handleStoredChange: (next) => actionsRef.current.handleStoredChange(next),
      patchPendingProps: (path, value) => actionsRef.current.patchPendingProps(path, value),
      handleSave: () => actionsRef.current.handleSave(),
      handlePublish: () => actionsRef.current.handlePublish(),
      handleDiscard: () => actionsRef.current.handleDiscard(),
      handleRefreshConflict: () => actionsRef.current.handleRefreshConflict(),
      undo: () => actionsRef.current.undo(),
      redo: () => actionsRef.current.redo(),
      exitEditMode: () => actionsRef.current.exitEditMode(),
      cancelPendingAdd: () => actionsRef.current.cancelPendingAdd(),
      handleDelete: (id) => actionsRef.current.handleDelete(id),
      handleDuplicate: (id) => actionsRef.current.handleDuplicate(id),
      handleReorder: (elementId, targetId, placement) =>
        actionsRef.current.handleReorder(elementId, targetId, placement),
      isStoredElement: (id) => actionsRef.current.isStoredElement(id),
      reportCollabPointerMove: (x, y) => actionsRef.current.reportCollabPointerMove(x, y),
      reloadLayoutAfterAgentPatch: () => actionsRef.current.reloadLayoutAfterAgentPatch(),
      applyAgentRevertedLayoutSpec: (spec) => actionsRef.current.applyAgentRevertedLayoutSpec(spec),
    }),
    [],
  );

  return (
    <EditorSessionActionsContext.Provider value={stableActions}>
      <EditorSessionDataContext.Provider value={data}>{children}</EditorSessionDataContext.Provider>
    </EditorSessionActionsContext.Provider>
  );
}

export function useEditorSessionData(): EditorSessionData {
  const ctx = useContext(EditorSessionDataContext);
  if (!ctx) {
    throw new Error("useEditorSessionData must be used within EditorSessionProvider");
  }
  return ctx;
}

export function useEditorSessionActions(): EditorSessionActions {
  const ctx = useContext(EditorSessionActionsContext);
  if (!ctx) {
    throw new Error("useEditorSessionActions must be used within EditorSessionProvider");
  }
  return ctx;
}

/** Full session — re-renders on any data change. Prefer split hooks in hot paths. */
export function useEditorSession(): EditorSessionValue {
  return { ...useEditorSessionData(), ...useEditorSessionActions() };
}

/** Merge runtime page context into the loaded visual_editor shell spec. */
export function mergeShellRuntimeConfig(
  spec: Spec,
  config: { templateName: string; pageContentRef: string | null },
): Spec {
  const root = spec.root;
  const shell = spec.elements[root];
  if (!shell) return spec;

  const props = (shell.props ?? {}) as Record<string, unknown>;

  return {
    ...spec,
    elements: {
      ...spec.elements,
      [root]: {
        ...shell,
        props: {
          ...props,
          templateName: config.templateName,
          pageContentRef: config.pageContentRef,
        },
      },
    },
  };
}
