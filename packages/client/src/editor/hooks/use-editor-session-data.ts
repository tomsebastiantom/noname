import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { createStateStore, type SetState } from "@json-render/react";
import { parseRichTextFieldValue, richTextToPlainText } from "@noname/documents";
import { useCallback, useMemo, useState } from "react";
import { CONTENT_DEFAULT_LOCALE } from "../content-entries";
import type { LayoutAgentActivity } from "../collab/collab-peer-display";
import type { CollabPeerPresence } from "../collab/presence";
import type { ContentDraftEditor } from "../components/panel/PropsPanel";
import type { ContentTypeSchema } from "../../documents/content-entries";
import type { LayerReorderPlacement } from "../lib/spec-utils";
import type { EditSelection, PendingBlockAdd } from "../lib/types";
import { editorHandlers } from "../registry";
import type {
  AgentTargetField,
  EditorSessionActions,
  EditorSessionData,
} from "./editor-session";
import type { EditorShellLabels } from "../schemas/components";

export const editorShellStore = createStateStore({});

export interface EditorSessionHistory {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  recordBeforeFieldChange: () => void;
}

export interface EditorSessionLayoutCollab {
  connected: boolean;
  error: string | null;
  peers: CollabPeerPresence[];
  agentTaskActivity: LayoutAgentActivity | null;
}

export interface EditorSessionContentDraft {
  values: Record<string, string>;
  parsed: { contentType?: string | null } | null;
  schema: ContentTypeSchema | null;
  loading: boolean;
  updateField: (key: string, value: string) => void;
}

/** Session data/actions assembly + content-field handlers for the edit page. */
export function useEditorSessionData({
  templateName,
  pageContentRef,
  registry,
  shellLabels,
  previewSpec,
  storedSpec,
  selection,
  setSelection,
  pendingAdd,
  contentDraft,
  dirty,
  draftStatus,
  canPublish,
  chromeError,
  saveSuccess,
  saveConflict,
  lastActivity,
  history,
  collabEnabled,
  layoutCollab,
  layoutDocumentId,
  stageAdd,
  handleStoredChange,
  patchPendingProps,
  handleSave,
  handlePublish,
  handleDiscard,
  handleRefreshConflict,
  cancelPendingAdd,
  handleDelete,
  handleDuplicate,
  handleReorder,
  isStoredElement,
  reportCollabPointerMove,
  reloadLayoutAfterAgentPatch,
  applyAgentRevertedLayoutSpec,
  exitEditMode,
}: Readonly<{
  templateName: string;
  pageContentRef: string | null;
  registry: ComponentRegistry;
  shellLabels: EditorShellLabels | null;
  previewSpec: Spec;
  storedSpec: Spec | null;
  selection: EditSelection | null;
  setSelection: (value: EditSelection | null) => void;
  pendingAdd: PendingBlockAdd | null;
  contentDraft: EditorSessionContentDraft;
  dirty: boolean;
  draftStatus: string | null;
  canPublish: boolean;
  chromeError: string | null;
  saveSuccess: string | null;
  saveConflict: boolean;
  lastActivity: string | null;
  history: EditorSessionHistory;
  collabEnabled: boolean;
  layoutCollab: EditorSessionLayoutCollab;
  layoutDocumentId: string | null;
  stageAdd: (componentType: string, parentId?: string, insertIndex?: number) => void;
  handleStoredChange: (next: Spec) => void;
  patchPendingProps: (fieldPath: string, value: unknown) => void;
  handleSave: () => Promise<void>;
  handlePublish: () => Promise<void>;
  handleDiscard: () => void;
  handleRefreshConflict: () => void;
  cancelPendingAdd: () => void;
  handleDelete: (elementId: string) => void;
  handleDuplicate: (elementId: string) => void;
  handleReorder: (elementId: string, targetId: string, placement: LayerReorderPlacement) => void;
  isStoredElement: (elementId: string) => boolean;
  reportCollabPointerMove: (cursorX: number | null, cursorY: number | null) => void;
  reloadLayoutAfterAgentPatch: () => Promise<void>;
  applyAgentRevertedLayoutSpec: (spec: Spec) => void;
  exitEditMode: () => void;
}>) {
  const [agentTargetField, setAgentTargetField] = useState<AgentTargetField | null>(null);

  const handleContentFieldChange = useCallback(
    (key: string, value: string) => {
      history.recordBeforeFieldChange();
      contentDraft.updateField(key, value);
    },
    [contentDraft, history],
  );

  const handleContentFieldFocus = useCallback(
    (field: { key: string; type: string; label: string }) => {
      const rawValue = contentDraft.values[field.key] ?? "";
      let excerpt: string | undefined;
      if (field.type === "richText" && rawValue.trim()) {
        const parsed = parseRichTextFieldValue(rawValue);
        if (parsed) {
          const plain = richTextToPlainText(parsed).trim();
          if (plain) excerpt = plain.slice(0, 200);
        }
      }
      setAgentTargetField({
        fieldKey: field.key,
        locale: CONTENT_DEFAULT_LOCALE,
        fieldLabel: field.label,
        fieldType: field.type,
        ...(excerpt ? { excerpt } : {}),
      });
    },
    [contentDraft.values],
  );

  const contentDraftEditor = useMemo(
    () => ({
      values: contentDraft.values,
      contentType: contentDraft.parsed?.contentType ?? null,
      contentRef: pageContentRef,
      schema: contentDraft.schema,
      locale: CONTENT_DEFAULT_LOCALE,
      loading: contentDraft.loading,
      onFieldChange: handleContentFieldChange,
      onFieldFocus: handleContentFieldFocus,
    }),
    [
      contentDraft.values,
      contentDraft.parsed?.contentType,
      contentDraft.schema,
      contentDraft.loading,
      handleContentFieldChange,
      handleContentFieldFocus,
      pageContentRef,
    ],
  );

  const sessionData = useMemo((): EditorSessionData | null => {
    if (!shellLabels) return null;
    return {
      templateName,
      pageContentRef,
      registry,
      shellLabels,
      previewSpec,
      storedSpec,
      selection,
      pendingAdd,
      contentDraft: contentDraftEditor,
      agentTargetField,
      dirty,
      draftStatus,
      canPublish,
      chromeError,
      saveSuccess,
      saveConflict,
      lastActivity,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
      collabEnabled,
      collabConnected: layoutCollab.connected,
      collabError: layoutCollab.error,
      collabPeers: layoutCollab.peers,
      agentTaskActivity: layoutCollab.agentTaskActivity,
      layoutDocumentId,
    };
  }, [
    shellLabels,
    templateName,
    pageContentRef,
    registry,
    previewSpec,
    storedSpec,
    selection,
    pendingAdd,
    contentDraftEditor,
    agentTargetField,
    dirty,
    draftStatus,
    canPublish,
    chromeError,
    saveSuccess,
    saveConflict,
    lastActivity,
    history.canUndo,
    history.canRedo,
    collabEnabled,
    layoutCollab.connected,
    layoutCollab.error,
    layoutCollab.peers,
    layoutCollab.agentTaskActivity,
    layoutDocumentId,
  ]);

  const sessionActions: EditorSessionActions = {
    setSelection,
    stageAdd,
    handleStoredChange,
    patchPendingProps,
    handleSave,
    handlePublish,
    handleDiscard,
    handleRefreshConflict,
    undo: history.undo,
    redo: history.redo,
    exitEditMode,
    cancelPendingAdd,
    handleDelete,
    handleDuplicate,
    handleReorder,
    isStoredElement,
    reportCollabPointerMove,
    reloadLayoutAfterAgentPatch,
    applyAgentRevertedLayoutSpec,
  };

  const editorActionHandlers = useMemo(
    () =>
      editorHandlers(
        () => editorShellStore.set.bind(editorShellStore) as unknown as SetState,
        () => editorShellStore.getSnapshot(),
      ),
    [],
  );

  return { sessionData, sessionActions, editorActionHandlers };
}
