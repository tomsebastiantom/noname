import type { Spec } from "@json-render/core";
import { componentAcceptsChildren } from "./catalog-slots";
import type { PendingBlockAdd } from "./types";

type SpecElement = {
  type: string;
  props?: Record<string, unknown>;
  children?: string[];
};

function elementsOf(spec: Spec): Record<string, SpecElement> {
  return spec.elements as Record<string, SpecElement>;
}

export function cloneSpec(spec: Spec): Spec {
  return JSON.parse(JSON.stringify(spec)) as Spec;
}

/** Stable key for React remount when block order / parentage changes. */
export function specStructureKey(spec: Spec): string {
  const parts: string[] = [];
  for (const [id, el] of Object.entries(elementsOf(spec))) {
    if (el.children?.length) {
      parts.push(`${id}:${el.children.join(",")}`);
    }
  }
  return parts.sort().join("|");
}

export function getElement(spec: Spec, elementId: string): SpecElement | null {
  return elementsOf(spec)[elementId] ?? null;
}

export function isStateBinding(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "$state" in (value as Record<string, unknown>)
  );
}

/** Dot path under props — e.g. labels.title or config.image */
export function getPropPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

export function setPropPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split(".");
  const out = { ...obj };
  let cur: Record<string, unknown> = out;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const next = cur[key];
    const cloned =
      next && typeof next === "object" && !Array.isArray(next)
        ? { ...(next as Record<string, unknown>) }
        : {};
    cur[key] = cloned;
    cur = cloned;
  }
  cur[parts[parts.length - 1]!] = value;
  return out;
}

export function patchElementField(
  spec: Spec,
  elementId: string,
  fieldPath: string,
  value: unknown,
): Spec {
  const next = cloneSpec(spec);
  const el = elementsOf(next)[elementId];
  if (!el) return spec;
  const props = (el.props ?? {}) as Record<string, unknown>;
  el.props = setPropPath(props, fieldPath, value);
  return next;
}

/** Apply literal layout patches from stored spec onto edge-resolved preview for selected element. */
export function mergeLiteralPropsIntoPreview(preview: Spec, stored: Spec, elementId: string): Spec {
  const storedEl = getElement(stored, elementId);
  const previewEl = getElement(preview, elementId);
  if (!storedEl?.props || !previewEl) return preview;

  const next = cloneSpec(preview);
  const target = elementsOf(next)[elementId]!;
  const storedProps = storedEl.props as Record<string, unknown>;
  const previewProps = { ...(target.props as Record<string, unknown>) };

  for (const bucket of ["config", "labels"] as const) {
    const storedBucket = storedProps[bucket];
    if (!storedBucket || typeof storedBucket !== "object" || Array.isArray(storedBucket)) continue;
    const previewBucket = (
      previewProps[bucket] && typeof previewProps[bucket] === "object"
        ? { ...(previewProps[bucket] as Record<string, unknown>) }
        : {}
    ) as Record<string, unknown>;

    for (const [key, val] of Object.entries(storedBucket as Record<string, unknown>)) {
      if (!isStateBinding(val)) {
        previewBucket[key] = val;
      }
    }
    previewProps[bucket] = previewBucket;
  }

  target.props = previewProps;
  return next;
}

export function findParentId(spec: Spec, childId: string): string | null {
  for (const [id, el] of Object.entries(elementsOf(spec))) {
    if (el.children?.includes(childId)) return id;
  }
  return null;
}

export function findFirstElementOfType(spec: Spec, type: string): string | null {
  for (const [id, el] of Object.entries(elementsOf(spec))) {
    if (el.type === type) return id;
  }
  return null;
}

/** First catalog container (has `slots`), optionally preferring a component type. */
export function findPreferredSlotParent(spec: Spec, preferredParentType?: string): string | null {
  if (preferredParentType) {
    const preferredId = findFirstElementOfType(spec, preferredParentType);
    if (preferredId) {
      const el = getElement(spec, preferredId);
      if (el && componentAcceptsChildren(el.type)) return preferredId;
    }
  }
  if (spec.root) {
    const rootEl = getElement(spec, spec.root);
    if (rootEl && componentAcceptsChildren(rootEl.type)) return spec.root;
  }
  for (const [id, el] of Object.entries(elementsOf(spec))) {
    if (id !== spec.root && componentAcceptsChildren(el.type)) return id;
  }
  return null;
}

function isDescendantOf(spec: Spec, ancestorId: string, candidateId: string): boolean {
  if (ancestorId === candidateId) return true;
  for (const childId of getElement(spec, ancestorId)?.children ?? []) {
    if (isDescendantOf(spec, childId, candidateId)) return true;
  }
  return false;
}

/** Swap element with previous/next sibling under the same parent. */
export function moveElementSibling(spec: Spec, elementId: string, direction: -1 | 1): Spec | null {
  if (elementId === spec.root) return null;
  const parentId = findParentId(spec, elementId);
  if (!parentId) return null;

  const parent = getElement(spec, parentId);
  const children = parent?.children ?? [];
  const index = children.indexOf(elementId);
  if (index < 0) return null;

  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= children.length) return null;

  const next = cloneSpec(spec);
  const nextParent = elementsOf(next)[parentId];
  if (!nextParent?.children) return null;

  const reordered = [...nextParent.children];
  const swapWith = reordered[targetIndex]!;
  reordered[targetIndex] = elementId;
  reordered[index] = swapWith;
  nextParent.children = reordered;
  return next;
}

/** Move element under a new slot container (reparent). */
export function reparentElement(
  spec: Spec,
  elementId: string,
  newParentId: string,
  insertIndex?: number,
): Spec | null {
  if (elementId === spec.root) return null;
  if (elementId === newParentId) return null;
  if (isDescendantOf(spec, elementId, newParentId)) return null;

  const el = getElement(spec, elementId);
  const newParent = getElement(spec, newParentId);
  if (!el || !newParent || !componentAcceptsChildren(newParent.type)) return null;

  const oldParentId = findParentId(spec, elementId);
  if (!oldParentId) return null;

  const next = cloneSpec(spec);
  const elements = elementsOf(next);
  const oldParent = elements[oldParentId];
  const targetParent = elements[newParentId];
  if (!oldParent?.children || !targetParent) return null;

  oldParent.children = oldParent.children.filter((id) => id !== elementId);

  targetParent.children = [...(targetParent.children ?? [])];
  let index = insertIndex ?? targetParent.children.length;
  if (oldParentId === newParentId && insertIndex === undefined) {
    index = targetParent.children.length;
  } else if (oldParentId === newParentId && insertIndex !== undefined) {
    const oldIndex = childrenIndexBeforeRemove(oldParent.children, elementId, insertIndex);
    index = oldIndex;
  }
  index = Math.max(0, Math.min(index, targetParent.children.length));
  targetParent.children.splice(index, 0, elementId);
  return next;
}

function childrenIndexBeforeRemove(
  children: string[],
  removedId: string,
  desiredIndex: number,
): number {
  const oldIndex = children.indexOf(removedId);
  if (oldIndex < 0) return desiredIndex;
  if (desiredIndex > oldIndex) return desiredIndex - 1;
  return desiredIndex;
}

export function listSlotContainerIds(spec: Spec): string[] {
  const ids: string[] = [];
  for (const [id, el] of Object.entries(elementsOf(spec))) {
    if (componentAcceptsChildren(el.type)) ids.push(id);
  }
  return ids;
}

export type LayerReorderPlacement = "before" | "after" | "inside";

/** Drag-and-drop / precise insert in the layer tree. */
export function reorderElement(
  spec: Spec,
  elementId: string,
  targetId: string,
  placement: LayerReorderPlacement,
): Spec | null {
  if (elementId === targetId) return null;
  if (isDescendantOf(spec, elementId, targetId)) return null;

  if (placement === "inside") {
    const container = getElement(spec, targetId);
    if (!container || !componentAcceptsChildren(container.type)) return null;
    return reparentElement(spec, elementId, targetId);
  }

  const parentId = findParentId(spec, targetId);
  if (!parentId) return null;
  const parent = getElement(spec, parentId);
  const targetIndex = parent?.children?.indexOf(targetId) ?? -1;
  if (targetIndex < 0) return null;

  const insertIndex = placement === "before" ? targetIndex : targetIndex + 1;
  return reparentElement(spec, elementId, parentId, insertIndex);
}

function uniqueElementId(type: string, usedIds: Set<string>): string {
  let candidate = `${type.toLowerCase()}-${Date.now().toString(36)}`;
  while (usedIds.has(candidate)) {
    candidate = `${type.toLowerCase()}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }
  usedIds.add(candidate);
  return candidate;
}

/** Deep-copy element subtree with new ids; insert after source as sibling. */
export function duplicateElementSubtree(
  spec: Spec,
  elementId: string,
): { spec: Spec; newElementId: string } | null {
  if (elementId === spec.root) return null;
  const sourceEl = getElement(spec, elementId);
  if (!sourceEl) return null;

  const parentId = findParentId(spec, elementId);
  if (!parentId) return null;
  const parent = getElement(spec, parentId);
  const siblingIndex = parent?.children?.indexOf(elementId) ?? -1;
  if (siblingIndex < 0) return null;

  const next = cloneSpec(spec);
  const elements = elementsOf(next);
  const usedIds = new Set(Object.keys(elements));

  function cloneSubtree(sourceId: string): string {
    const node = getElement(spec, sourceId);
    if (!node) throw new Error(`Missing element ${sourceId}`);
    const newId = uniqueElementId(node.type, usedIds);
    const childIds = (node.children ?? []).map(cloneSubtree);
    elements[newId] = {
      type: node.type,
      props: node.props ? JSON.parse(JSON.stringify(node.props)) : undefined,
      ...(childIds.length > 0 ? { children: childIds } : {}),
    };
    return newId;
  }

  const newElementId = cloneSubtree(elementId);
  const newParent = elements[parentId];
  if (!newParent?.children) {
    newParent!.children = [newElementId];
  } else {
    newParent.children.splice(siblingIndex + 1, 0, newElementId);
  }

  return { spec: next, newElementId };
}

function collectDescendantIds(spec: Spec, elementId: string): string[] {
  const ids = [elementId];
  const el = getElement(spec, elementId);
  for (const childId of el?.children ?? []) {
    ids.push(...collectDescendantIds(spec, childId));
  }
  return ids;
}

/** Remove element and its subtree from spec. Returns null if root or not found. */
export function removeElementFromSpec(spec: Spec, elementId: string): Spec | null {
  if (elementId === spec.root) return null;
  if (!getElement(spec, elementId)) return null;

  const parentId = findParentId(spec, elementId);
  if (!parentId) return null;

  const next = cloneSpec(spec);
  const elements = elementsOf(next);
  const parent = elements[parentId];
  if (parent?.children) {
    parent.children = parent.children.filter((id) => id !== elementId);
  }

  for (const id of collectDescendantIds(spec, elementId)) {
    delete elements[id];
  }

  return next;
}

export function canRemoveElement(spec: Spec, elementId: string): boolean {
  return elementId !== spec.root && Boolean(getElement(spec, elementId));
}

/** Apply all literal layout props from stored spec onto edge-resolved preview. */
export function mergeStoredLiteralsIntoPreview(preview: Spec, stored: Spec): Spec {
  let next = preview;
  for (const elementId of Object.keys(stored.elements ?? {})) {
    next = mergeLiteralPropsIntoPreview(next, stored, elementId);
  }
  return next;
}

/**
 * Editor preview: stored spec is structural source of truth (new drops, reorder, children).
 * Edge-resolved display spec supplies CMS/state bindings for elements that exist on both.
 */
export function mergeStoredEditsIntoPreview(display: Spec, stored: Spec): Spec {
  const next = cloneSpec(stored);
  const outEls = elementsOf(next);

  for (const id of Object.keys(outEls)) {
    if (!getElement(display, id)) continue;
    const storedEl = outEls[id]!;
    const patched = mergeLiteralPropsIntoPreview(display, stored, id);
    const merged = getElement(patched, id);
    if (merged) {
      outEls[id] = {
        ...merged,
        type: storedEl.type,
        children: storedEl.children,
      };
    }
  }

  return next;
}

/** Overlay in-progress content field edits onto preview for `$state`-bound config props. */
export function mergeContentDraftIntoPreview(
  preview: Spec,
  stored: Spec,
  contentValues: Record<string, string>,
): Spec {
  if (Object.keys(contentValues).length === 0) return preview;

  const next = cloneSpec(preview);
  const storedEls = elementsOf(stored);
  const outEls = elementsOf(next);

  for (const [id, storedEl] of Object.entries(storedEls)) {
    const previewEl = outEls[id];
    if (!previewEl) continue;

    const storedConfig = (storedEl.props as { config?: Record<string, unknown> } | undefined)
      ?.config;
    if (!storedConfig) continue;

    const previewProps = { ...(previewEl.props as Record<string, unknown>) };
    const previewConfig = {
      ...((previewProps.config as Record<string, unknown> | undefined) ?? {}),
    };
    let changed = false;

    for (const [key, val] of Object.entries(storedConfig)) {
      if (!isStateBinding(val) || !(key in contentValues)) continue;
      const raw = contentValues[key] ?? "";
      previewConfig[key] = key === "price" ? (raw === "" ? 0 : Number(raw)) : raw || null;
      changed = true;
    }

    if (changed) {
      previewProps.config = previewConfig;
      outEls[id] = { ...previewEl, props: previewProps };
    }
  }

  return next;
}

export function patchBlockProps(
  props: { config: Record<string, unknown>; labels: Record<string, unknown> },
  fieldPath: string,
  value: unknown,
): { config: Record<string, unknown>; labels: Record<string, unknown> } {
  return setPropPath(props as Record<string, unknown>, fieldPath, value) as {
    config: Record<string, unknown>;
    labels: Record<string, unknown>;
  };
}

/** Preview-only: show staged block before Save draft commits it to the layout. */
export function mergePendingAddIntoPreview(
  preview: Spec,
  _stored: Spec,
  pending: PendingBlockAdd | null,
  contentValues: Record<string, string> = {},
): Spec {
  if (!pending) return preview;

  const next = cloneSpec(preview);
  const elements = elementsOf(next);

  let parentId = pending.parentId;
  if (!parentId || !elements[parentId]) {
    parentId = next.root;
  }
  const parent = elements[parentId];
  if (!parent) return preview;

  const config = { ...pending.props.config };
  const labels = { ...pending.props.labels };

  for (const [key, val] of Object.entries(config)) {
    if (isStateBinding(val) && key in contentValues) {
      const raw = contentValues[key] ?? "";
      config[key] = key === "price" ? (raw === "" ? 0 : Number(raw)) : raw || null;
    }
  }

  elements[pending.tempElementId] = {
    type: pending.componentType,
    props: { config, labels },
  };

  parent.children = [...(parent.children ?? [])];
  const insertAt = pending.insertIndex ?? parent.children.length;
  const clamped = Math.max(0, Math.min(insertAt, parent.children.length));
  parent.children.splice(clamped, 0, pending.tempElementId);

  return next;
}

export function addComponentToSpec(
  spec: Spec,
  componentType: string,
  meta: {
    defaultProps: { config: Record<string, unknown>; labels: Record<string, unknown> };
    preferredParentType?: string;
  },
  options?: { parentId?: string; insertIndex?: number },
): { spec: Spec; elementId: string } | null {
  const next = cloneSpec(spec);
  const elements = elementsOf(next);
  let parentId: string | undefined = options?.parentId;
  if (parentId && !elements[parentId]) {
    parentId = undefined;
  }
  if (!parentId) {
    parentId = findPreferredSlotParent(next, meta.preferredParentType) ?? undefined;
  }
  if (!parentId) return null;
  const parent = elements[parentId];
  if (!parent || !componentAcceptsChildren(parent.type)) return null;

  const elementId = `${componentType.toLowerCase()}-${Date.now().toString(36)}`;
  elements[elementId] = {
    type: componentType,
    props: {
      config: { ...meta.defaultProps.config },
      labels: { ...meta.defaultProps.labels },
    },
  };
  parent.children = [...(parent.children ?? [])];
  const insertAt = options?.insertIndex ?? parent.children.length;
  const clamped = Math.max(0, Math.min(insertAt, parent.children.length));
  parent.children.splice(clamped, 0, elementId);
  return { spec: next, elementId };
}
