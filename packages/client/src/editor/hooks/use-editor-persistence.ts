import type { Spec } from "@json-render/core";
import type { MutableRefObject } from "react";
import { useCallback, useState } from "react";
import { ApiConflictError } from "../../lib/api";
import type { PendingBlockAdd } from "../lib/types";

export interface EditorPersistenceContentDraft {
  dirty: boolean;
  saveContent: () => Promise<void>;
  publishContent: () => Promise<void>;
  discardContent: () => void;
  parsed: { contentType?: string | null } | null;
}

export interface EditorPersistenceHistory {
  clearHistory: () => void;
}

export interface EditorPersistenceShellLabels {
  draftSavedLabel: string;
  publishedLabel: string;
  saveConflictMessage: string;
}

/**
 * Save / publish / discard + save status state for the edit page.
 *
 * `commitRef` / `pendingAddRef` are ref-forwarded because the commit function is
 * created after this hook (element mutations). Values are read at call time, which
 * matches the original callback semantics.
 */
export function useEditorPersistence({
  contentDraft,
  commitRef,
  pendingAddRef,
  storedSpec,
  layoutDirty,
  saveDraft,
  publishDraft,
  discardChanges,
  cancelPendingAdd,
  pageContentRef,
  shellLabels,
  history,
  onReload,
}: Readonly<{
  contentDraft: EditorPersistenceContentDraft;
  commitRef: MutableRefObject<() => Spec | null>;
  pendingAddRef: MutableRefObject<PendingBlockAdd | null>;
  storedSpec: Spec | null;
  layoutDirty: boolean;
  saveDraft: (spec: Spec) => Promise<void>;
  publishDraft: (spec: Spec) => Promise<void>;
  discardChanges: () => void;
  cancelPendingAdd: () => void;
  pageContentRef: string | null;
  shellLabels: EditorPersistenceShellLabels | null;
  history: EditorPersistenceHistory;
  onReload: () => void;
}>) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveConflict, setSaveConflict] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [activityRefreshKey, setActivityRefreshKey] = useState(0);

  const handleSave = useCallback(async () => {
    if (!shellLabels) return;
    setSaveError(null);
    setSaveConflict(false);
    try {
      if (contentDraft.dirty) {
        await contentDraft.saveContent();
      }
      const pendingAdd = pendingAddRef.current;
      const specAfterPending = pendingAdd ? commitRef.current() : storedSpec;
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
    commitRef,
    pendingAddRef,
    layoutDirty,
    storedSpec,
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
      const specAfterPending = pendingAddRef.current ? commitRef.current() : storedSpec;
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
    commitRef,
    pendingAddRef,
    storedSpec,
    publishDraft,
    pageContentRef,
    onReload,
    shellLabels,
    history,
  ]);

  const handleDiscard = useCallback(() => {
    discardChanges();
    contentDraft.discardContent();
    cancelPendingAdd();
    history.clearHistory();
    setSaveSuccess(null);
    setSaveError(null);
    setSaveConflict(false);
  }, [discardChanges, contentDraft, cancelPendingAdd, history]);

  const handleRefreshConflict = useCallback(() => {
    setSaveConflict(false);
    setSaveError(null);
    history.clearHistory();
    onReload();
  }, [history, onReload]);

  return {
    saveError,
    saveConflict,
    saveSuccess,
    setSaveSuccess,
    activityRefreshKey,
    handleSave,
    handlePublish,
    handleDiscard,
    handleRefreshConflict,
  };
}
