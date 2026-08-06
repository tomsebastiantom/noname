import * as Automerge from "@automerge/automerge";
import type { Spec } from "@json-render/core";

export type AutomergeSpecDoc = Record<string, unknown>;

export function specToAutomergeDoc(spec: Spec): AutomergeSpecDoc {
  return Automerge.from(JSON.parse(JSON.stringify(spec)) as AutomergeSpecDoc);
}

export function automergeDocToSpec(doc: AutomergeSpecDoc): Spec {
  return JSON.parse(JSON.stringify(doc)) as Spec;
}

export function applyAutomergeSyncMessage(
  doc: AutomergeSpecDoc,
  syncState: Automerge.SyncState,
  message: Uint8Array,
): { doc: AutomergeSpecDoc; syncState: Automerge.SyncState; reply: Uint8Array | null } {
  const [nextDoc, nextSyncState] = Automerge.receiveSyncMessage(doc, syncState, message);
  const [replyState, reply] = Automerge.generateSyncMessage(nextDoc, nextSyncState);
  return { doc: nextDoc, syncState: replyState, reply };
}

export function pushLocalSpec(doc: AutomergeSpecDoc, next: Spec): AutomergeSpecDoc {
  return Automerge.merge(doc, Automerge.clone(specToAutomergeDoc(next)));
}

type AutomergeChildrenList = {
  deleteAt: (index: number, count: number) => void;
  insertAt: (index: number, value: string) => void;
};

/** Reorder `children` with list CRDT ops (avoid whole-array replace for merge safety). */
export function reorderChildrenListOps(
  draft: AutomergeSpecDoc,
  elementId: string,
  nextOrder: string[],
): void {
  const elements = draft.elements as Record<string, { children?: string[] }>;
  const list = elements[elementId]?.children as unknown as AutomergeChildrenList | undefined;
  if (!list) return;

  const current = [...(elements[elementId]?.children ?? [])];
  for (const id of nextOrder) {
    const from = current.indexOf(id);
    if (from < 0) continue;
    const to = nextOrder.indexOf(id);
    if (from === to) continue;
    list.deleteAt(from, 1);
    list.insertAt(to, id);
    current.splice(from, 1);
    current.splice(to, 0, id);
  }
}

/** Move one child from one parent list to another via list CRDT ops. */
export function reparentChildrenListOps(
  draft: AutomergeSpecDoc,
  elementId: string,
  fromParentId: string,
  toParentId: string,
  toIndex: number,
): void {
  const elements = draft.elements as Record<string, { children?: string[] }>;
  const fromChildren = elements[fromParentId]?.children ?? [];
  const fromIndex = fromChildren.indexOf(elementId);
  if (fromIndex < 0) return;

  const fromList = elements[fromParentId]?.children as unknown as AutomergeChildrenList | undefined;
  const toList = elements[toParentId]?.children as unknown as AutomergeChildrenList | undefined;
  if (!fromList || !toList) return;

  fromList.deleteAt(fromIndex, 1);
  toList.insertAt(toIndex, elementId);
}

/** Pure cross-parent reparent — one child moved between parents, no add/remove. */
export function detectCrossParentReparent(
  prev: Spec,
  next: Spec,
): { elementId: string; fromParentId: string; toParentId: string; toIndex: number } | null {
  const prevEls = prev.elements ?? {};
  const nextEls = next.elements ?? {};
  let fromParent: string | null = null;
  let toParent: string | null = null;
  let removedId: string | null = null;
  let addedId: string | null = null;
  let toIndex = -1;

  for (const id of new Set([...Object.keys(prevEls), ...Object.keys(nextEls)])) {
    const prevChildren = prevEls[id]?.children ?? [];
    const nextChildren = nextEls[id]?.children ?? [];
    if (prevChildren.join(",") === nextChildren.join(",")) continue;

    const prevSet = new Set(prevChildren);
    const nextSet = new Set(nextChildren);
    const removed = prevChildren.filter((childId) => !nextSet.has(childId));
    const added = nextChildren.filter((childId) => !prevSet.has(childId));

    if (removed.length === 1 && added.length === 0) {
      if (fromParent !== null) return null;
      fromParent = id;
      removedId = removed[0]!;
    } else if (added.length === 1 && removed.length === 0) {
      if (toParent !== null) return null;
      toParent = id;
      addedId = added[0]!;
      toIndex = nextChildren.indexOf(added[0]!);
    } else {
      return null;
    }
  }

  if (!fromParent || !toParent || !removedId || !addedId || removedId !== addedId) return null;
  if (fromParent === toParent || toIndex < 0) return null;

  return {
    elementId: removedId,
    fromParentId: fromParent,
    toParentId: toParent,
    toIndex,
  };
}

/** Pure reorder within one parent — same child ids, different order only. */
export function detectSingleParentChildrenReorder(
  prev: Spec,
  next: Spec,
): { parentId: string; nextOrder: string[] } | null {
  const prevEls = prev.elements ?? {};
  const nextEls = next.elements ?? {};
  let changedParent: string | null = null;

  for (const id of new Set([...Object.keys(prevEls), ...Object.keys(nextEls)])) {
    const prevChildren = prevEls[id]?.children ?? [];
    const nextChildren = nextEls[id]?.children ?? [];
    if (prevChildren.length === 0 && nextChildren.length === 0) continue;
    if (prevChildren.join(",") === nextChildren.join(",")) continue;
    if (prevChildren.length !== nextChildren.length) return null;

    const prevSet = new Set(prevChildren);
    if (nextChildren.some((childId) => !prevSet.has(childId))) return null;
    if (changedParent !== null) return null;

    changedParent = id;
  }

  if (!changedParent) return null;
  const nextOrder = nextEls[changedParent]?.children;
  if (!nextOrder) return null;
  return { parentId: changedParent, nextOrder: [...nextOrder] };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assignJsonField(target: Record<string, unknown>, key: string, value: unknown): void {
  if (value === undefined) {
    delete target[key];
    return;
  }
  target[key] = JSON.parse(JSON.stringify(value));
}

function patchRecordInPlace(
  draft: Record<string, unknown>,
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): void {
  for (const key of Object.keys(prev)) {
    if (!(key in next)) delete draft[key];
  }
  for (const [key, nextVal] of Object.entries(next)) {
    const prevVal = prev[key];
    if (JSON.stringify(prevVal) === JSON.stringify(nextVal)) continue;
    if (isPlainObject(prevVal) && isPlainObject(nextVal) && isPlainObject(draft[key])) {
      patchRecordInPlace(draft[key] as Record<string, unknown>, prevVal, nextVal);
      continue;
    }
    assignJsonField(draft, key, nextVal);
  }
}

function applyElementDiffToDraft(
  draftEl: Record<string, unknown>,
  prevEl: Record<string, unknown>,
  nextEl: Record<string, unknown>,
): void {
  for (const field of ["type", "visible"] as const) {
    if (JSON.stringify(prevEl[field]) !== JSON.stringify(nextEl[field])) {
      if (nextEl[field] === undefined) delete draftEl[field];
      else assignJsonField(draftEl, field, nextEl[field]);
    }
  }
  if (JSON.stringify(prevEl.props) !== JSON.stringify(nextEl.props)) {
    if (nextEl.props === undefined) {
      delete draftEl.props;
    } else if (!isPlainObject(draftEl.props) || !isPlainObject(nextEl.props)) {
      assignJsonField(draftEl, "props", nextEl.props);
    } else {
      patchRecordInPlace(
        draftEl.props as Record<string, unknown>,
        (prevEl.props ?? {}) as Record<string, unknown>,
        nextEl.props as Record<string, unknown>,
      );
    }
  }
  if (JSON.stringify(prevEl.children) !== JSON.stringify(nextEl.children)) {
    if (nextEl.children === undefined) delete draftEl.children;
    else assignJsonField(draftEl, "children", nextEl.children);
  }
}

/** Scalar / structural spec diff via in-place draft mutation (for handle.change). */
export function applySpecTreeDiffToDraft(draft: AutomergeSpecDoc, prev: Spec, next: Spec): void {
  if (prev.root !== next.root) {
    draft.root = next.root;
  }
  const prevEls = (prev.elements ?? {}) as Record<string, Record<string, unknown>>;
  const nextEls = (next.elements ?? {}) as Record<string, Record<string, unknown>>;
  if (!draft.elements) draft.elements = {};
  const draftEls = draft.elements as Record<string, Record<string, unknown>>;

  for (const id of Object.keys(prevEls)) {
    if (!(id in nextEls)) delete draftEls[id];
  }
  for (const [id, nextEl] of Object.entries(nextEls)) {
    const prevEl = prevEls[id];
    if (!prevEl || !draftEls[id]) {
      draftEls[id] = JSON.parse(JSON.stringify(nextEl));
      continue;
    }
    applyElementDiffToDraft(draftEls[id]!, prevEl, nextEl);
  }
}

/** Apply a local editor spec edit inside handle.change (triggers automerge-repo peer sync). */
export function applyLocalSpecToDraft(
  draft: AutomergeSpecDoc,
  prev: Spec | null,
  next: Spec,
): void {
  if (prev === null) {
    const fresh = specToAutomergeDoc(next);
    for (const key of Object.keys(draft)) {
      if (!(key in fresh)) delete draft[key];
    }
    for (const [key, value] of Object.entries(fresh)) {
      draft[key] = JSON.parse(JSON.stringify(value));
    }
    return;
  }
  const reorder = detectSingleParentChildrenReorder(prev, next);
  if (reorder) {
    reorderChildrenListOps(draft, reorder.parentId, reorder.nextOrder);
    return;
  }
  const reparent = detectCrossParentReparent(prev, next);
  if (reparent) {
    reparentChildrenListOps(
      draft,
      reparent.elementId,
      reparent.fromParentId,
      reparent.toParentId,
      reparent.toIndex,
    );
    return;
  }
  applySpecTreeDiffToDraft(draft, prev, next);
}

export function pushLocalSpecChange(
  doc: AutomergeSpecDoc,
  prev: Spec,
  next: Spec,
): AutomergeSpecDoc {
  const reorder = detectSingleParentChildrenReorder(prev, next);
  if (reorder) {
    return Automerge.change(doc, (draft) => {
      reorderChildrenListOps(draft, reorder.parentId, reorder.nextOrder);
    });
  }
  const reparent = detectCrossParentReparent(prev, next);
  if (reparent) {
    return Automerge.change(doc, (draft) => {
      reparentChildrenListOps(
        draft,
        reparent.elementId,
        reparent.fromParentId,
        reparent.toParentId,
        reparent.toIndex,
      );
    });
  }
  return pushLocalSpec(doc, next);
}

export function initialAutomergeSyncMessage(
  doc: AutomergeSpecDoc,
  syncState: Automerge.SyncState,
): { syncState: Automerge.SyncState; message: Uint8Array | null } {
  const [nextSyncState, message] = Automerge.generateSyncMessage(doc, syncState);
  return { syncState: nextSyncState, message };
}
