import type { Spec } from "@json-render/core";
import { useCallback, useRef, useState } from "react";
import { cloneSpec } from "../lib/spec-utils";
import type { EditSelection, PendingBlockAdd } from "../lib/types";

export type EditorHistorySnapshot = {
  storedSpec: Spec | null;
  contentValues: Record<string, string>;
  pendingAdd: PendingBlockAdd | null;
  selection: EditSelection | null;
};

const MAX_HISTORY = 50;
const FIELD_BURST_MS = 450;

function cloneSnapshot(snapshot: EditorHistorySnapshot): EditorHistorySnapshot {
  return {
    storedSpec: snapshot.storedSpec ? cloneSpec(snapshot.storedSpec) : null,
    contentValues: { ...snapshot.contentValues },
    pendingAdd: snapshot.pendingAdd
      ? {
          ...snapshot.pendingAdd,
          props: {
            config: { ...snapshot.pendingAdd.props.config },
            labels: { ...snapshot.pendingAdd.props.labels },
          },
        }
      : null,
    selection: snapshot.selection ? { ...snapshot.selection } : null,
  };
}

function recordsEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function pendingEqual(a: PendingBlockAdd | null, b: PendingBlockAdd | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.tempElementId === b.tempElementId &&
    a.componentType === b.componentType &&
    JSON.stringify(a.props) === JSON.stringify(b.props)
  );
}

function selectionEqual(a: EditSelection | null, b: EditSelection | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.elementId === b.elementId && a.componentType === b.componentType;
}

function snapshotsEqual(a: EditorHistorySnapshot, b: EditorHistorySnapshot): boolean {
  if (
    a.storedSpec !== b.storedSpec &&
    JSON.stringify(a.storedSpec) !== JSON.stringify(b.storedSpec)
  ) {
    return false;
  }
  if (!recordsEqual(a.contentValues, b.contentValues)) return false;
  if (!pendingEqual(a.pendingAdd, b.pendingAdd)) return false;
  if (!selectionEqual(a.selection, b.selection)) return false;
  return true;
}

export function useEditorHistory({
  getSnapshot,
  applySnapshot,
}: {
  getSnapshot: () => EditorHistorySnapshot;
  applySnapshot: (snapshot: EditorHistorySnapshot) => void;
}) {
  const pastRef = useRef<EditorHistorySnapshot[]>([]);
  const futureRef = useRef<EditorHistorySnapshot[]>([]);
  const applyingRef = useRef(false);
  const fieldBurstRef = useRef(false);
  const fieldBurstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [revision, setRevision] = useState(0);

  const notify = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const pushSnapshot = useCallback(
    (snapshot: EditorHistorySnapshot) => {
      const stack = pastRef.current;
      const last = stack[stack.length - 1];
      if (last && snapshotsEqual(last, snapshot)) return;
      stack.push(cloneSnapshot(snapshot));
      if (stack.length > MAX_HISTORY) stack.shift();
      futureRef.current = [];
      notify();
    },
    [notify],
  );

  const recordBeforeChange = useCallback(() => {
    if (applyingRef.current) return;
    pushSnapshot(getSnapshot());
  }, [getSnapshot, pushSnapshot]);

  const recordBeforeFieldChange = useCallback(() => {
    if (applyingRef.current) return;
    if (fieldBurstRef.current) return;
    recordBeforeChange();
    fieldBurstRef.current = true;
    if (fieldBurstTimerRef.current) clearTimeout(fieldBurstTimerRef.current);
    fieldBurstTimerRef.current = setTimeout(() => {
      fieldBurstRef.current = false;
    }, FIELD_BURST_MS);
  }, [recordBeforeChange]);

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;
    applyingRef.current = true;
    futureRef.current.unshift(cloneSnapshot(getSnapshot()));
    const previous = past.pop()!;
    applySnapshot(previous);
    applyingRef.current = false;
    notify();
  }, [applySnapshot, getSnapshot, notify]);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;
    applyingRef.current = true;
    pastRef.current.push(cloneSnapshot(getSnapshot()));
    const next = future.shift()!;
    applySnapshot(next);
    applyingRef.current = false;
    notify();
  }, [applySnapshot, getSnapshot, notify]);

  const clearHistory = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    fieldBurstRef.current = false;
    if (fieldBurstTimerRef.current) clearTimeout(fieldBurstTimerRef.current);
    notify();
  }, [notify]);

  void revision;

  return {
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    recordBeforeChange,
    recordBeforeFieldChange,
    undo,
    redo,
    clearHistory,
  };
}
