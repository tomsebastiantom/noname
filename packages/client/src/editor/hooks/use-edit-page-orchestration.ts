import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clearSession } from "../../auth/session";
import { isAuthErrorMessage } from "../../lib/api";
import { activateEditorDevtools, releaseEditorDevtools } from "../activate-editor-devtools";
import { useLayoutCollab } from "../collab/use-layout-collab";
import {
  mergeContentDraftIntoPreview,
  mergePendingAddIntoPreview,
  mergeStoredEditsIntoPreview,
} from "../lib/spec-utils";
import type { EditSelection, PendingBlockAdd } from "../lib/types";
import { useEditorHistory } from "./use-editor-history";
import { useEditorPersistence } from "./use-editor-persistence";
import { editorShellStore, useEditorSessionData } from "./use-editor-session-data";
import { useEditorShellConfig } from "./use-editor-shell-config";
import { useElementMutations } from "./use-element-mutations";
import { useContentDraft } from "./use-content-draft";
import { useDocumentActivity } from "./use-document-activity";
import { useLayoutDraft } from "./use-layout-draft";

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
    reloadFromServer,
  } = useLayoutDraft(templateName, displaySpec);

  const contentDraft = useContentDraft(pageContentRef);
  const [pendingAdd, setPendingAdd] = useState<PendingBlockAdd | null>(null);
  const [selection, setSelection] = useState<EditSelection | null>(null);
  const dirty = layoutDirty || contentDraft.dirty || pendingAdd !== null;

  const {
    shellLabels,
    shellLabelsMissing,
    shellLabelsLoading,
    mergedShellSpec,
    labelsMissingMessage,
  } = useEditorShellConfig({ shellSpecFromEdge, templateName, pageContentRef });

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

  const storedSpecRef = useRef(storedSpec);
  storedSpecRef.current = storedSpec;
  const contentValuesRef = useRef(contentDraft.values);
  contentValuesRef.current = contentDraft.values;
  const pendingAddRef = useRef(pendingAdd);
  pendingAddRef.current = pendingAdd;
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  // Stable snapshot closures (refs only) so history methods keep identity across
  // keystrokes — this is what lets memoized palette/layer rows bail out.
  const getSnapshot = useCallback(
    () => ({
      storedSpec: storedSpecRef.current,
      contentValues: { ...contentValuesRef.current },
      pendingAdd: pendingAddRef.current,
      selection: selectionRef.current,
    }),
    [],
  );
  const { restoreValues } = contentDraft;

  // Stable forwarder: persistence owns setSaveSuccess but is created after mutations.
  const saveSuccessRef = useRef<(value: string | null) => void>(() => {});
  const setSaveSuccess = useCallback(
    (value: string | null) => saveSuccessRef.current(value),
    [],
  );

  const applySnapshot = useCallback(
    (snapshot: {
      storedSpec: Spec | null;
      contentValues: Record<string, string>;
      pendingAdd: PendingBlockAdd | null;
      selection: EditSelection | null;
    }) => {
      if (snapshot.storedSpec) {
        updateStoredSpec(snapshot.storedSpec);
      }
      restoreValues(snapshot.contentValues);
      setPendingAdd(snapshot.pendingAdd);
      setSelection(snapshot.selection);
      setSaveSuccess(null);
    },
    [updateStoredSpec, restoreValues, setPendingAdd, setSelection, setSaveSuccess],
  );

  const history = useEditorHistory({ getSnapshot, applySnapshot });

  // Stable facade: useEditorHistory methods are individually stable, but the
  // returned object literal is new each render — which would bust memoization
  // downstream (palette rows, layer rows).
  const { recordBeforeChange, recordBeforeFieldChange, clearHistory } = history;
  const stableHistory = useMemo(
    () => ({ recordBeforeChange, recordBeforeFieldChange, clearHistory }),
    [recordBeforeChange, recordBeforeFieldChange, clearHistory],
  );

  const collabEnabled = !loading && Boolean(draft?.layoutId && storedSpec);
  const collabRef = useRef<{ applyLocalSpec: (spec: Spec) => void } | null>(null);
  const applyLocalSpec = useCallback(
    (spec: Spec) => collabRef.current?.applyLocalSpec(spec),
    [],
  );

  const collabEnabledRef = useRef(collabEnabled);
  collabEnabledRef.current = collabEnabled;

  const mutations = useElementMutations({
    storedSpecRef,
    pendingAddRef,
    updateStoredSpec,
    history: stableHistory,
    collabEnabledRef,
    applyLocalSpec,
    pendingAdd,
    setPendingAdd,
    selection,
    setSelection,
    setSaveSuccess,
  });

  const layoutCollab = useLayoutCollab({
    enabled: collabEnabled && !loading && Boolean(draft?.layoutId && storedSpec),
    layoutDocumentId: draft?.layoutId ?? null,
    initialSpec: storedSpec,
    onRemoteSpec: updateStoredSpec,
  });
  collabRef.current = layoutCollab;

  useEffect(() => {
    if (!collabEnabled || !layoutCollab.connected) return;
    layoutCollab.updatePresence({ selectedElementId: selection?.elementId ?? null });
  }, [collabEnabled, layoutCollab.connected, layoutCollab.updatePresence, selection?.elementId]);

  const reportCollabPointerMove = useCallback(
    (cursorX: number | null, cursorY: number | null) => {
      if (!collabEnabled || !layoutCollab.connected) return;
      layoutCollab.updatePresence({
        selectedElementId: selectionRef.current?.elementId ?? null,
        cursorX,
        cursorY,
      });
    },
    [collabEnabled, layoutCollab.connected, layoutCollab.updatePresence],
  );

  const reloadLayoutAfterAgentPatch = useCallback(async () => {
    const delaysMs = [0, 400, 1_200];
    for (const delayMs of delaysMs) {
      if (delayMs > 0) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, delayMs);
        });
      }
      const spec = await reloadFromServer();
      if (spec && collabEnabled) {
        layoutCollab.applyLocalSpec(spec);
      }
    }
  }, [reloadFromServer, collabEnabled, layoutCollab]);

  const applyAgentRevertedLayoutSpec = useCallback(
    (spec: Spec) => {
      updateStoredSpec(spec);
      if (collabEnabled) {
        layoutCollab.applyLocalSpec(spec);
      }
      setSaveSuccess(null);
    },
    [updateStoredSpec, collabEnabled, layoutCollab, setSaveSuccess],
  );

  const commitRef = useRef<() => Spec | null>(() => null);
  commitRef.current = mutations.commitPendingToSpec;

  const persistence = useEditorPersistence({
    contentDraft,
    commitRef,
    pendingAddRef,
    storedSpec,
    layoutDirty,
    saveDraft,
    publishDraft,
    discardChanges,
    cancelPendingAdd: mutations.cancelPendingAdd,
    pageContentRef,
    shellLabels,
    history: stableHistory,
    onReload,
  });
  saveSuccessRef.current = persistence.setSaveSuccess;

  const lastActivity = useDocumentActivity(draft?.layoutId, shellLabels, persistence.activityRefreshKey, {
    enabled: !loading && Boolean(shellLabels),
  });

  const { sessionData, sessionActions, editorActionHandlers } = useEditorSessionData({
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
    draftStatus: draft?.status ?? null,
    canPublish,
    chromeError: persistence.saveError ?? loadError ?? contentDraft.loadError ?? layoutCollab.error,
    saveSuccess: persistence.saveSuccess,
    saveConflict: persistence.saveConflict,
    lastActivity,
    history,
    collabEnabled,
    layoutCollab,
    layoutDocumentId: draft?.layoutId ?? null,
    stageAdd: mutations.stageAdd,
    handleStoredChange: mutations.handleStoredChange,
    patchPendingProps: mutations.patchPendingProps,
    handleSave: persistence.handleSave,
    handlePublish: persistence.handlePublish,
    handleDiscard: persistence.handleDiscard,
    handleRefreshConflict: persistence.handleRefreshConflict,
    cancelPendingAdd: mutations.cancelPendingAdd,
    handleDelete: mutations.handleDelete,
    handleDuplicate: mutations.handleDuplicate,
    handleReorder: mutations.handleReorder,
    isStoredElement: mutations.isStoredElement,
    reportCollabPointerMove,
    reloadLayoutAfterAgentPatch,
    applyAgentRevertedLayoutSpec,
    exitEditMode: useCallback(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("edit");
      window.location.replace(url.pathname + url.search + url.hash);
    }, []),
  });

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
