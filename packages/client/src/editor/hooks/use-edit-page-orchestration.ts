import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { createStateStore, type SetState } from "@json-render/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearSession } from "../../auth/session";
import { ApiConflictError, isAuthErrorMessage } from "../../lib/api";
import { activateEditorDevtools, releaseEditorDevtools } from "../activate-editor-devtools";
import { defaultPropsForType } from "../components/palette/ComponentPalette";
import { CONTENT_DEFAULT_LOCALE } from "../content-entries";
import {
  addComponentToSpec,
  canRemoveElement,
  duplicateElementSubtree,
  getElement,
  type LayerReorderPlacement,
  mergeContentDraftIntoPreview,
  mergePendingAddIntoPreview,
  mergeStoredEditsIntoPreview,
  patchBlockProps,
  removeElementFromSpec,
  reorderElement,
} from "../lib/spec-utils";
import type { EditSelection, PendingBlockAdd } from "../lib/types";
import { editorHandlers } from "../registry";
import {
  type EditorSessionActions,
  type EditorSessionData,
  mergeShellRuntimeConfig,
} from "./editor-session";
import { useContentDraft } from "./use-content-draft";
import { useEditorHistory } from "./use-editor-history";
import { parseShellFromSpec, useEditorShell } from "./use-editor-shell-labels";
import { useLayoutDraft } from "./use-layout-draft";
import { useDocumentActivity } from "./use-document-activity";

const editorShellStore = createStateStore({});

export function useEditPageOrchestration({
  displaySpec,
  templateName,
  pageContentRef,
  registry,
  onReload,
  shellSpec: shellSpecFromEdge,
}: Readonly<{
  displaySpec: Spec;
  templateName: string;
  pageContentRef: string | null;
  registry: ComponentRegistry;
  onReload: () => void;
  /** Edge-composed visual_editor shell — preferred over client layout fetch. */
  shellSpec?: Spec | null;
}>) {
  const {
    draft,
    storedSpec,
    loadError,
    loading,
    dirty: layoutDirty,
    canPublish,
    updateStoredSpec,
    saveDraft,
    publishDraft,
    discardChanges,
  } = useLayoutDraft(templateName, displaySpec);

  const contentDraft = useContentDraft(pageContentRef);
  const [pendingAdd, setPendingAdd] = useState<PendingBlockAdd | null>(null);
  const dirty = layoutDirty || contentDraft.dirty || pendingAdd !== null;

  const [selection, setSelection] = useState<EditSelection | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);
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

  const lastActivity = useDocumentActivity(draft?.layoutId, shellLabels, activityRefreshKey, {
    enabled: !loading && Boolean(shellLabels),
  });

  useEffect(() => {
    activateEditorDevtools();
    return () => releaseEditorDevtools();
  }, []);

  useEffect(() => {
    if (!isAuthErrorMessage(loadError)) return;
    clearSession();
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?redirect=${redirect}`;
  }, [loadError]);

  const previewSpec = useMemo(() => {
    if (!storedSpec) return displaySpec;
    let next = mergeStoredEditsIntoPreview(displaySpec, storedSpec);
    next = mergeContentDraftIntoPreview(next, storedSpec, contentDraft.values);
    next = mergePendingAddIntoPreview(next, storedSpec, pendingAdd, contentDraft.values);
    return next;
  }, [displaySpec, storedSpec, contentDraft.values, pendingAdd]);

  useEffect(() => {
    if (!pendingAdd || !selection || !storedSpec) return;
    if (selection.elementId === pendingAdd.tempElementId) return;
    if (getElement(storedSpec, selection.elementId)) return;
    setSelection({ elementId: pendingAdd.tempElementId, componentType: pendingAdd.componentType });
  }, [pendingAdd, selection, storedSpec]);

  const storedSpecRef = useRef(storedSpec);
  storedSpecRef.current = storedSpec;
  const contentValuesRef = useRef(contentDraft.values);
  contentValuesRef.current = contentDraft.values;
  const pendingAddRef = useRef(pendingAdd);
  pendingAddRef.current = pendingAdd;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const history = useEditorHistory({
    getSnapshot: () => ({
      storedSpec: storedSpecRef.current,
      contentValues: { ...contentValuesRef.current },
      pendingAdd: pendingAddRef.current,
      selection: selectionRef.current,
    }),
    applySnapshot: (snapshot) => {
      if (snapshot.storedSpec) {
        updateStoredSpec(snapshot.storedSpec);
      }
      contentDraft.restoreValues(snapshot.contentValues);
      setPendingAdd(snapshot.pendingAdd);
      setSelection(snapshot.selection);
      setSaveSuccess(null);
    },
  });

  const handleStoredChange = useCallback(
    (next: Spec) => {
      history.recordBeforeFieldChange();
      updateStoredSpec(next);
      setSaveSuccess(null);
    },
    [updateStoredSpec, history],
  );

  const stageAdd = useCallback(
    (componentType: string, parentId?: string, insertIndex?: number) => {
      if (!storedSpec) return;
      history.recordBeforeChange();
      const defaults = defaultPropsForType(componentType);
      if (!defaults) return;
      const tempElementId = `${componentType.toLowerCase()}-pending-${Date.now().toString(36)}`;
      setPendingAdd({
        componentType,
        tempElementId,
        parentId,
        insertIndex,
        props: {
          config: { ...defaults.defaultProps.config },
          labels: { ...defaults.defaultProps.labels },
        },
      });
      setSelection({ elementId: tempElementId, componentType });
      setSaveSuccess(null);
    },
    [storedSpec, history],
  );

  const cancelPendingAdd = useCallback(() => {
    history.recordBeforeChange();
    setPendingAdd(null);
    setSelection(null);
    setSaveSuccess(null);
  }, [history]);

  const patchPendingProps = useCallback(
    (fieldPath: string, value: unknown) => {
      history.recordBeforeFieldChange();
      setPendingAdd((current) => {
        if (!current) return current;
        return {
          ...current,
          props: patchBlockProps(current.props, fieldPath, value),
        };
      });
      setSaveSuccess(null);
    },
    [history],
  );

  const commitPendingToSpec = useCallback((): Spec | null => {
    if (!pendingAdd || !storedSpec) return storedSpec;
    history.recordBeforeChange();
    const defaults = defaultPropsForType(pendingAdd.componentType);
    if (!defaults) return storedSpec;
    const result = addComponentToSpec(
      storedSpec,
      pendingAdd.componentType,
      {
        defaultProps: pendingAdd.props,
        preferredParentType: defaults.preferredParentType,
      },
      { parentId: pendingAdd.parentId, insertIndex: pendingAdd.insertIndex },
    );
    if (!result) return storedSpec;
    setPendingAdd(null);
    setSelection({ elementId: result.elementId, componentType: pendingAdd.componentType });
    updateStoredSpec(result.spec);
    return result.spec;
  }, [pendingAdd, storedSpec, updateStoredSpec, history]);

  const handleDelete = useCallback(
    (elementId: string) => {
      history.recordBeforeChange();
      if (pendingAdd?.tempElementId === elementId) {
        cancelPendingAdd();
        return;
      }
      if (!storedSpec || !canRemoveElement(storedSpec, elementId)) return;
      const next = removeElementFromSpec(storedSpec, elementId);
      if (!next) return;
      updateStoredSpec(next);
      setSelection(null);
      setSaveSuccess(null);
    },
    [pendingAdd, storedSpec, updateStoredSpec, cancelPendingAdd, history],
  );

  const isStoredElement = useCallback(
    (elementId: string) => Boolean(storedSpec && getElement(storedSpec, elementId)),
    [storedSpec],
  );

  const handleReorder = useCallback(
    (elementId: string, targetId: string, placement: LayerReorderPlacement) => {
      if (!storedSpec || pendingAdd?.tempElementId === elementId) return;
      history.recordBeforeChange();
      const next = reorderElement(storedSpec, elementId, targetId, placement);
      if (!next) return;
      updateStoredSpec(next);
      setSaveSuccess(null);
    },
    [storedSpec, pendingAdd, updateStoredSpec, history],
  );

  const handleDuplicate = useCallback(
    (elementId: string) => {
      if (!storedSpec || pendingAdd?.tempElementId === elementId) return;
      history.recordBeforeChange();
      const result = duplicateElementSubtree(storedSpec, elementId);
      if (!result) return;
      updateStoredSpec(result.spec);
      const el = getElement(result.spec, result.newElementId);
      if (el) {
        setSelection({ elementId: result.newElementId, componentType: el.type });
      }
      setSaveSuccess(null);
    },
    [storedSpec, pendingAdd, updateStoredSpec, history],
  );

  const exitEditMode = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("edit");
    window.location.replace(url.pathname + url.search + url.hash);
  }, []);

  const handleSave = useCallback(async () => {
    if (!shellLabels) return;
    setSaveError(null);
    setSaveConflict(false);
    try {
      if (contentDraft.dirty) {
        await contentDraft.saveContent();
      }
      const specAfterPending = pendingAdd ? commitPendingToSpec() : storedSpec;
      if (layoutDirty || pendingAdd) {
        if (!specAfterPending) throw new Error("No layout to save");
        await saveDraft(specAfterPending);
      }
      setSaveSuccess(shellLabels.draftSavedLabel);
      history.clearHistory();
      setActivityRefreshKey((key) => key + 1);
      onReload();
    } catch (err) {
      if (err instanceof ApiConflictError) {
        setSaveConflict(true);
        setSaveError(shellLabels.saveConflictMessage);
        return;
      }
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }, [
    contentDraft,
    pendingAdd,
    layoutDirty,
    storedSpec,
    commitPendingToSpec,
    saveDraft,
    onReload,
    shellLabels,
    history,
  ]);

  const handlePublish = useCallback(async () => {
    if (!shellLabels) return;
    setSaveError(null);
    setSaveConflict(false);
    try {
      if (contentDraft.dirty) {
        await contentDraft.saveContent();
      }
      const specAfterPending = pendingAdd ? commitPendingToSpec() : storedSpec;
      if (!specAfterPending) throw new Error("No layout to save");
      await publishDraft(specAfterPending);
      if (pageContentRef && contentDraft.parsed) {
        await contentDraft.publishContent();
      }
      setSaveSuccess(shellLabels.publishedLabel);
      history.clearHistory();
      setActivityRefreshKey((key) => key + 1);
      onReload();
    } catch (err) {
      if (err instanceof ApiConflictError) {
        setSaveConflict(true);
        setSaveError(shellLabels.saveConflictMessage);
        return;
      }
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }, [
    contentDraft,
    pendingAdd,
    storedSpec,
    commitPendingToSpec,
    publishDraft,
    pageContentRef,
    onReload,
    shellLabels,
    history,
  ]);

  const handleRefreshConflict = useCallback(() => {
    setSaveConflict(false);
    setSaveError(null);
    history.clearHistory();
    onReload();
  }, [history, onReload]);

  const handleContentFieldChange = useCallback(
    (key: string, value: string) => {
      history.recordBeforeFieldChange();
      contentDraft.updateField(key, value);
    },
    [contentDraft, history],
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
    }),
    [
      contentDraft.values,
      contentDraft.parsed?.contentType,
      contentDraft.schema,
      contentDraft.loading,
      handleContentFieldChange,
      pageContentRef,
    ],
  );

  const chromeError = saveError ?? loadError ?? contentDraft.loadError;

  const handleDiscard = useCallback(() => {
    discardChanges();
    contentDraft.discardContent();
    cancelPendingAdd();
    history.clearHistory();
    setSaveSuccess(null);
    setSaveError(null);
    setSaveConflict(false);
  }, [discardChanges, contentDraft, cancelPendingAdd, history]);

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
      dirty,
      draftStatus: draft?.status ?? null,
      canPublish,
      chromeError,
      saveSuccess,
      saveConflict,
      lastActivity,
      canUndo: history.canUndo,
      canRedo: history.canRedo,
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
    dirty,
    draft?.status,
    canPublish,
    chromeError,
    saveSuccess,
    saveConflict,
    lastActivity,
    history.canUndo,
    history.canRedo,
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
  };

  const editorActionHandlers = useMemo(
    () =>
      editorHandlers(
        () => editorShellStore.set.bind(editorShellStore) as unknown as SetState,
        () => editorShellStore.getSnapshot(),
      ),
    [],
  );

  const mergedShellSpec = useMemo(() => {
    if (!shellSpec) return null;
    return mergeShellRuntimeConfig(shellSpec, { templateName, pageContentRef });
  }, [shellSpec, templateName, pageContentRef]);

  const labelsMissingMessage = useMemo(() => {
    if (shellLabels?.labelsMissingHint) return shellLabels.labelsMissingHint;
    if (!shellSpec?.root) return "Editor shell layout missing.";
    const shell = shellSpec.elements[shellSpec.root];
    const hint = (shell?.props as { labels?: { labelsMissingHint?: string } } | undefined)?.labels
      ?.labelsMissingHint;
    return hint ?? "Editor shell layout missing or labels invalid.";
  }, [shellLabels, shellSpec]);

  return {
    editorShellStore,
    sessionData,
    sessionActions,
    editorActionHandlers,
    mergedShellSpec,
    labelsMissingMessage,
    shellLabelsLoading,
    shellLabelsMissing,
    layoutLoading: loading,
    storedSpec,
  };
}
