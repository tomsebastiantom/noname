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

function snapshotsEqual(a: EditorHistorySnapshot, b: EditorHistorySnapshot): boolean {
  return (
    JSON.stringify(a.storedSpec) === JSON.stringify(b.storedSpec) &&
    JSON.stringify(a.contentValues) === JSON.stringify(b.contentValues) &&
    JSON.stringify(a.pendingAdd) === JSON.stringify(b.pendingAdd) &&
    JSON.stringify(a.selection) === JSON.stringify(b.selection)
  );
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
