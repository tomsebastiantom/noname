import type { Spec } from "@json-render/core";
import { useCallback, useEffect, type MutableRefObject } from "react";
import { defaultPropsForType } from "../components/palette/ComponentPalette";
import {
  addComponentToSpec,
  canRemoveElement,
  duplicateElementSubtree,
  getElement,
  type LayerReorderPlacement,
  patchBlockProps,
  removeElementFromSpec,
  reorderElement,
} from "../lib/spec-utils";
import type { EditSelection, PendingBlockAdd } from "../lib/types";

export interface ElementMutationsHistory {
  recordBeforeChange: () => void;
  recordBeforeFieldChange: () => void;
  clearHistory: () => void;
}

/**
 * Pending-block staging + selection + all element mutations (add/delete/reorder/duplicate).
 *
 * Spec state is read via refs at call time (not render time), so all returned
 * callbacks keep stable identity across keystrokes — memoized palette rows and
 * layer-tree rows can bail out. `pendingAdd` / `selection` values are still
 * returned for render.
 */
export function useElementMutations({
  storedSpecRef,
  pendingAddRef,
  updateStoredSpec,
  history,
  collabEnabledRef,
  applyLocalSpec,
  pendingAdd,
  setPendingAdd,
  selection,
  setSelection,
  setSaveSuccess,
}: Readonly<{
  storedSpecRef: MutableRefObject<Spec | null>;
  pendingAddRef: MutableRefObject<PendingBlockAdd | null>;
  updateStoredSpec: (spec: Spec) => void;
  history: ElementMutationsHistory;
  collabEnabledRef: MutableRefObject<boolean>;
  applyLocalSpec: (spec: Spec) => void;
  pendingAdd: PendingBlockAdd | null;
  setPendingAdd: (value: PendingBlockAdd | null | ((current: PendingBlockAdd | null) => PendingBlockAdd | null)) => void;
  selection: EditSelection | null;
  setSelection: (value: EditSelection | null) => void;
  setSaveSuccess: (value: string | null) => void;
}>) {
  const storedSpec = storedSpecRef.current;

  useEffect(() => {
    if (!pendingAdd || !selection || !storedSpec) return;
    if (selection.elementId === pendingAdd.tempElementId) return;
    if (getElement(storedSpec, selection.elementId)) return;
    setSelection({ elementId: pendingAdd.tempElementId, componentType: pendingAdd.componentType });
  }, [pendingAdd, selection, storedSpec, setSelection]);

  const applySpecAndSync = useCallback(
    (next: Spec) => {
      updateStoredSpec(next);
      if (collabEnabledRef.current) {
        applyLocalSpec(next);
      }
      setSaveSuccess(null);
    },
    [updateStoredSpec, collabEnabledRef, applyLocalSpec, setSaveSuccess],
  );

  const stageAdd = useCallback(
    (componentType: string, parentId?: string, insertIndex?: number) => {
      const current = storedSpecRef.current;
      if (!current) return;
      history.recordBeforeChange();
      const defaults = defaultPropsForType(componentType);
      if (!defaults) return;
      const tempElementId = `${componentType.toLowerCase()}-pending-${Date.now().toString(36)}`;
      setPendingAdd({
        componentType,
        tempElementId,
        parentId,
        insertIndex,
        props: { ...defaults.defaultProps },
      });
      setSelection({ elementId: tempElementId, componentType });
      setSaveSuccess(null);
    },
    [storedSpecRef, history, setPendingAdd, setSelection, setSaveSuccess],
  );

  const cancelPendingAdd = useCallback(() => {
    history.recordBeforeChange();
    setPendingAdd(null);
    setSelection(null);
    setSaveSuccess(null);
  }, [history, setPendingAdd, setSelection, setSaveSuccess]);

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
    [history, setPendingAdd, setSaveSuccess],
  );

  const commitPendingToSpec = useCallback((): Spec | null => {
    const pending = pendingAddRef.current;
    const current = storedSpecRef.current;
    if (!pending || !current) return current;
    history.recordBeforeChange();
    const defaults = defaultPropsForType(pending.componentType);
    if (!defaults) return current;
    const result = addComponentToSpec(
      current,
      pending.componentType,
      {
        defaultProps: pending.props,
        preferredParentType: defaults.preferredParentType,
      },
      { parentId: pending.parentId, insertIndex: pending.insertIndex },
    );
    if (!result) return current;
    setPendingAdd(null);
    setSelection({ elementId: result.elementId, componentType: pending.componentType });
    updateStoredSpec(result.spec);
    return result.spec;
  }, [pendingAddRef, storedSpecRef, updateStoredSpec, history, setPendingAdd, setSelection]);

  const handleDelete = useCallback(
    (elementId: string) => {
      history.recordBeforeChange();
      if (pendingAddRef.current?.tempElementId === elementId) {
        cancelPendingAdd();
        return;
      }
      const current = storedSpecRef.current;
      if (!current || !canRemoveElement(current, elementId)) return;
      const next = removeElementFromSpec(current, elementId);
      if (!next) return;
      updateStoredSpec(next);
      setSelection(null);
      setSaveSuccess(null);
    },
    [pendingAddRef, storedSpecRef, updateStoredSpec, cancelPendingAdd, history, setSelection, setSaveSuccess],
  );

  const isStoredElement = useCallback(
    (elementId: string) => {
      const current = storedSpecRef.current;
      return Boolean(current && getElement(current, elementId));
    },
    [storedSpecRef],
  );

  const handleReorder = useCallback(
    (elementId: string, targetId: string, placement: LayerReorderPlacement) => {
      const current = storedSpecRef.current;
      if (!current || pendingAddRef.current?.tempElementId === elementId) return;
      history.recordBeforeChange();
      const next = reorderElement(current, elementId, targetId, placement);
      if (!next) return;
      applySpecAndSync(next);
    },
    [storedSpecRef, pendingAddRef, history, applySpecAndSync],
  );

  const handleDuplicate = useCallback(
    (elementId: string) => {
      const current = storedSpecRef.current;
      if (!current || pendingAddRef.current?.tempElementId === elementId) return;
      history.recordBeforeChange();
      const result = duplicateElementSubtree(current, elementId);
      if (!result) return;
      updateStoredSpec(result.spec);
      if (collabEnabledRef.current) {
        applyLocalSpec(result.spec);
      }
      const el = getElement(result.spec, result.newElementId);
      if (el) {
        setSelection({ elementId: result.newElementId, componentType: el.type });
      }
      setSaveSuccess(null);
    },
    [
      storedSpecRef,
      pendingAddRef,
      updateStoredSpec,
      history,
      collabEnabledRef,
      applyLocalSpec,
      setSelection,
      setSaveSuccess,
    ],
  );

  const handleStoredChange = useCallback(
    (next: Spec) => {
      history.recordBeforeFieldChange();
      applySpecAndSync(next);
    },
    [history, applySpecAndSync],
  );

  return {
    stageAdd,
    cancelPendingAdd,
    patchPendingProps,
    commitPendingToSpec,
    handleDelete,
    isStoredElement,
    handleReorder,
    handleDuplicate,
    handleStoredChange,
  };
}
