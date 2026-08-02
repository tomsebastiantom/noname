import type { Spec } from "@json-render/core";
import { componentAcceptsChildren } from "../../lib/catalog-slots";
import { getElement } from "../../lib/spec-utils";

export type DropPlacement = {
  parentId: string;
  parentType: string;
  insertIndex: number;
};

/** True when a dropped block can be inserted under this spec element. */
export function isDropTarget(spec: Spec, elementId: string): boolean {
  const el = getElement(spec, elementId);
  if (!el) return false;
  return componentAcceptsChildren(el.type);
}

export function listDropTargetIds(spec: Spec): string[] {
  const ids: string[] = [];
  for (const [id, el] of Object.entries(spec.elements ?? {})) {
    if (componentAcceptsChildren(el.type)) {
      ids.push(id);
    }
  }
  return ids;
}

function jrKeyNode(node: Element | null): HTMLElement | null {
  const match = node?.closest("[data-jr-key]");
  return match instanceof HTMLElement ? match : null;
}

export function resolveDropParentId(spec: Spec, target: EventTarget | null): string | undefined {
  let node = jrKeyNode(target as Element | null);
  while (node) {
    const elementId = node.getAttribute("data-jr-key");
    if (elementId && isDropTarget(spec, elementId)) return elementId;
    node = jrKeyNode(node.parentElement);
  }
  return undefined;
}

function stackIsRow(spec: Spec, parentId: string): boolean {
  const el = getElement(spec, parentId);
  const direction = (el?.props as { config?: { direction?: string } } | undefined)?.config
    ?.direction;
  return direction === "row" || direction === "row-reverse";
}

function domNodeForKey(root: HTMLElement, elementId: string): HTMLElement | null {
  const node = root.querySelector(`[data-jr-key="${CSS.escape(elementId)}"]`);
  return node instanceof HTMLElement ? node : null;
}

/** Pointer position → sibling index inside parent container. */
export function resolveInsertIndex(
  spec: Spec,
  parentId: string,
  root: HTMLElement,
  clientX: number,
  clientY: number,
): number {
  const parent = getElement(spec, parentId);
  const children = parent?.children ?? [];
  if (children.length === 0) return 0;

  const horizontal = parent?.type === "Grid" || stackIsRow(spec, parentId);

  for (let i = 0; i < children.length; i++) {
    const childNode = domNodeForKey(root, children[i]!);
    if (!childNode) continue;
    const rect = childNode.getBoundingClientRect();
    const mid = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
    const pointer = horizontal ? clientX : clientY;
    if (pointer < mid) return i;
  }
  return children.length;
}

export function resolveDropPlacement(
  spec: Spec,
  target: EventTarget | null,
  root: HTMLElement,
  clientX: number,
  clientY: number,
): DropPlacement | null {
  const parentId = resolveDropParentId(spec, target);
  if (!parentId) return null;
  const parent = getElement(spec, parentId);
  if (!parent) return null;
  return {
    parentId,
    parentType: parent.type,
    insertIndex: resolveInsertIndex(spec, parentId, root, clientX, clientY),
  };
}

export type DropIndicatorRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  horizontal: boolean;
};

/** Pixel rect for insertion line, relative to canvas root. */
export function dropIndicatorRect(
  spec: Spec,
  root: HTMLElement,
  placement: DropPlacement,
): DropIndicatorRect | null {
  const canvasRect = root.getBoundingClientRect();
  const parentNode = domNodeForKey(root, placement.parentId);
  if (!parentNode) return null;

  const parentEl = getElement(spec, placement.parentId);
  const children = parentEl?.children ?? [];
  const horizontal = parentEl?.type === "Grid" || stackIsRow(spec, placement.parentId);

  const toLocal = (rect: DOMRect) => ({
    top: rect.top - canvasRect.top + root.scrollTop,
    left: rect.left - canvasRect.left + root.scrollLeft,
    width: rect.width,
    height: rect.height,
  });

  if (children.length === 0) {
    const inner = parentNode.getBoundingClientRect();
    const pad = 8;
    return {
      ...toLocal(inner),
      top: toLocal(inner).top + pad,
      left: toLocal(inner).left + pad,
      width: Math.max(inner.width - pad * 2, 24),
      height: Math.max(inner.height - pad * 2, 24),
      horizontal,
    };
  }

  const idx = placement.insertIndex;
  let anchorRect: DOMRect;

  if (idx <= 0) {
    const first = domNodeForKey(root, children[0]!);
    if (!first) return null;
    anchorRect = first.getBoundingClientRect();
    const local = toLocal(anchorRect);
    if (horizontal) {
      return {
        top: local.top,
        left: local.left - 2,
        width: 4,
        height: local.height,
        horizontal: true,
      };
    }
    return {
      top: local.top - 2,
      left: local.left,
      width: local.width,
      height: 4,
      horizontal: false,
    };
  }

  if (idx >= children.length) {
    const last = domNodeForKey(root, children[children.length - 1]!);
    if (!last) return null;
    anchorRect = last.getBoundingClientRect();
    const local = toLocal(anchorRect);
    if (horizontal) {
      return {
        top: local.top,
        left: local.left + local.width - 2,
        width: 4,
        height: local.height,
        horizontal: true,
      };
    }
    return {
      top: local.top + local.height - 2,
      left: local.left,
      width: local.width,
      height: 4,
      horizontal: false,
    };
  }

  const before = domNodeForKey(root, children[idx - 1]!);
  const after = domNodeForKey(root, children[idx]!);
  if (!before || !after) return null;
  const a = before.getBoundingClientRect();
  const b = after.getBoundingClientRect();
  if (horizontal) {
    const x = (a.right + b.left) / 2;
    return {
      top: Math.min(a.top, b.top) - canvasRect.top + root.scrollTop,
      left: x - canvasRect.left + root.scrollLeft - 2,
      width: 4,
      height: Math.max(a.height, b.height),
      horizontal: true,
    };
  }
  const y = (a.bottom + b.top) / 2;
  return {
    top: y - canvasRect.top + root.scrollTop - 2,
    left: Math.min(a.left, b.left) - canvasRect.left + root.scrollLeft,
    width: Math.max(a.width, b.width),
    height: 4,
    horizontal: false,
  };
}

const GHOST_MIN = { width: 120, height: 40 };

/** Dashed placeholder where the new block will appear. */
export function dropGhostRect(
  spec: Spec,
  root: HTMLElement,
  placement: DropPlacement,
): DropIndicatorRect | null {
  const canvasRect = root.getBoundingClientRect();
  const parentNode = domNodeForKey(root, placement.parentId);
  if (!parentNode) return null;

  const parentEl = getElement(spec, placement.parentId);
  const children = parentEl?.children ?? [];
  const horizontal = parentEl?.type === "Grid" || stackIsRow(spec, placement.parentId);

  const toLocal = (rect: DOMRect) => ({
    top: rect.top - canvasRect.top + root.scrollTop,
    left: rect.left - canvasRect.left + root.scrollLeft,
    width: rect.width,
    height: rect.height,
  });

  if (children.length === 0) {
    const inner = parentNode.getBoundingClientRect();
    const local = toLocal(inner);
    const pad = 12;
    return {
      top: local.top + pad,
      left: local.left + pad,
      width: Math.max(inner.width - pad * 2, GHOST_MIN.width),
      height: Math.max(inner.height - pad * 2, GHOST_MIN.height),
      horizontal,
    };
  }

  const idx = placement.insertIndex;

  if (horizontal) {
    const rowHeight = () => {
      const first = domNodeForKey(root, children[0]!);
      return first ? toLocal(first.getBoundingClientRect()).height : GHOST_MIN.height;
    };
    const h = rowHeight();

    if (idx <= 0) {
      const first = domNodeForKey(root, children[0]!);
      if (!first) return null;
      const fl = toLocal(first.getBoundingClientRect());
      return {
        top: fl.top,
        left: fl.left - GHOST_MIN.width - 4,
        width: GHOST_MIN.width,
        height: h,
        horizontal: true,
      };
    }
    if (idx >= children.length) {
      const last = domNodeForKey(root, children[children.length - 1]!);
      if (!last) return null;
      const ll = toLocal(last.getBoundingClientRect());
      return {
        top: ll.top,
        left: ll.left + ll.width + 4,
        width: GHOST_MIN.width,
        height: h,
        horizontal: true,
      };
    }
    const before = domNodeForKey(root, children[idx - 1]!);
    const after = domNodeForKey(root, children[idx]!);
    if (!before || !after) return null;
    const a = before.getBoundingClientRect();
    const b = after.getBoundingClientRect();
    const midX = (a.right + b.left) / 2;
    return {
      top: Math.min(a.top, b.top) - canvasRect.top + root.scrollTop,
      left: midX - canvasRect.left + root.scrollLeft - GHOST_MIN.width / 2,
      width: GHOST_MIN.width,
      height: Math.max(a.height, b.height),
      horizontal: true,
    };
  }

  if (idx <= 0) {
    const first = domNodeForKey(root, children[0]!);
    if (!first) return null;
    const fl = toLocal(first.getBoundingClientRect());
    return {
      top: fl.top - GHOST_MIN.height - 4,
      left: fl.left,
      width: fl.width,
      height: GHOST_MIN.height,
      horizontal: false,
    };
  }
  if (idx >= children.length) {
    const last = domNodeForKey(root, children[children.length - 1]!);
    if (!last) return null;
    const ll = toLocal(last.getBoundingClientRect());
    return {
      top: ll.top + ll.height + 4,
      left: ll.left,
      width: ll.width,
      height: GHOST_MIN.height,
      horizontal: false,
    };
  }
  const before = domNodeForKey(root, children[idx - 1]!);
  const after = domNodeForKey(root, children[idx]!);
  if (!before || !after) return null;
  const a = before.getBoundingClientRect();
  const b = after.getBoundingClientRect();
  const midY = (a.bottom + b.top) / 2;
  return {
    top: midY - canvasRect.top + root.scrollTop - GHOST_MIN.height / 2,
    left: Math.min(a.left, b.left) - canvasRect.left + root.scrollLeft,
    width: Math.max(a.width, b.width),
    height: GHOST_MIN.height,
    horizontal: false,
  };
}
