import type { Spec } from "@json-render/core";
import type { ComponentRegistry } from "@json-render/react";
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { CatalogUiShell } from "../../../platform/catalog-ui-shell";
import type { CollabPeerPresence } from "../../collab/presence";
import { peerPresenceColor } from "../../collab/presence";
import { getEditorDragComponentType, setEditorDragComponentType } from "../../editor-drag-state";
import type { CanvasPreviewWidth } from "../../editor-layout-prefs";
import { editMetaForType } from "../../lib/edit-metadata";
import { canRemoveElement, findParentId, getElement, specStructureKey } from "../../lib/spec-utils";
import type { EditSelection } from "../../lib/types";
import { EDITOR_DRAG_MIME, PALETTE_DRAG_MIME } from "../../lib/types";
import type { EditorShellLabels } from "../../schemas/components";
import { CollabRemoteCursors } from "./CollabRemoteCursors";
import {
  type DropPlacement,
  dropGhostRect,
  dropIndicatorRect,
  listDropTargetIds,
  resolveDropPlacement,
} from "./drop-utils";

import "./editor.css";

type DropIndicator = DropPlacement & {
  rect: { top: number; left: number; width: number; height: number; horizontal: boolean };
  ghostRect: { top: number; left: number; width: number; height: number; horizontal: boolean };
  label: string;
  ghostLabel: string;
};

function blockLabel(componentType: string | null, labels: EditorShellLabels): string {
  if (!componentType) return labels.canvasBlockFallbackLabel;
  return editMetaForType(componentType)?.label ?? componentType;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replace(`{${key}}`, value),
    template,
  );
}

function buildDropLabel(
  spec: Spec,
  placement: DropPlacement,
  componentType: string | null,
  labels: EditorShellLabels,
): string {
  const block = blockLabel(componentType, labels);
  const parent = getElement(spec, placement.parentId);
  const childCount = parent?.children?.length ?? 0;
  if (childCount === 0) {
    return fillTemplate(labels.dropInsideEmptyTemplate, {
      block,
      parent: placement.parentType,
    });
  }
  const pos = placement.insertIndex;
  if (pos === 0) {
    return fillTemplate(labels.dropAtTopTemplate, { block, parent: placement.parentType });
  }
  if (pos >= childCount) {
    return fillTemplate(labels.dropAtBottomTemplate, { block, parent: placement.parentType });
  }
  return fillTemplate(labels.dropAtSlotTemplate, {
    block,
    parent: placement.parentType,
    slot: String(pos + 1),
  });
}

function dragTargetFromEvent(
  event: DragEvent<HTMLDivElement>,
  canvasRoot: HTMLElement | null,
): EventTarget | null {
  const under = document.elementFromPoint(event.clientX, event.clientY);
  if (under instanceof Node && canvasRoot?.contains(under)) {
    return under;
  }
  return event.target;
}

const PREVIEW_MAX_WIDTH: Record<Exclude<CanvasPreviewWidth, "full">, number> = {
  tablet: 768,
  mobile: 390,
};

export function EditorCanvas({
  previewSpec,
  registry,
  storedSpec,
  pendingElementId,
  pendingComponentType,
  selection,
  shellLabels,
  canvasPreview = "full",
  canUndo = false,
  canRedo = false,
  onUndo,
  onRedo,
  onSelect,
  onClearSelection,
  onAdd,
  onDelete,
  onDuplicate,
  onCollabPointerMove,
  collabPeers = [],
}: {
  previewSpec: Spec;
  registry: ComponentRegistry;
  storedSpec: Spec | null;
  pendingElementId: string | null;
  pendingComponentType: string | null;
  selection: EditSelection | null;
  shellLabels: EditorShellLabels;
  canvasPreview?: CanvasPreviewWidth;
  canUndo?: boolean;
  canRedo?: boolean;
  collabPeers?: CollabPeerPresence[];
  onUndo?: () => void;
  onRedo?: () => void;
  onSelect: (selection: EditSelection) => void;
  onClearSelection: () => void;
  onAdd: (componentType: string, parentId?: string, insertIndex?: number) => void;
  onDelete: (elementId: string) => void;
  onDuplicate?: (elementId: string) => void;
  onCollabPointerMove?: (cursorX: number | null, cursorY: number | null) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const suppressClickAfterDropRef = useRef(false);
  const selectedNodeRef = useRef<HTMLElement | null>(null);
  const lastScrolledSelectionRef = useRef<string | null>(null);
  const lastClickRef = useRef<{ elementId: string; at: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(null);
  const [selectionChip, setSelectionChip] = useState<{
    top: number;
    left: number;
    label: string;
  } | null>(null);
  const collabPointerThrottleRef = useRef(0);

  const handleCollabPointerMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!onCollabPointerMove) return;
      const root = canvasRef.current;
      if (!root) return;
      const now = Date.now();
      if (now - collabPointerThrottleRef.current < 50) return;
      collabPointerThrottleRef.current = now;
      const rect = root.getBoundingClientRect();
      onCollabPointerMove(
        event.clientX - rect.left + root.scrollLeft,
        event.clientY - rect.top + root.scrollTop,
      );
    },
    [onCollabPointerMove],
  );

  const handleCollabPointerLeave = useCallback(() => {
    onCollabPointerMove?.(null, null);
  }, [onCollabPointerMove]);

  useLayoutEffect(() => {
    if (!onCollabPointerMove || !selection) return;
    const root = canvasRef.current;
    if (!root) return;
    const node = root.querySelector(`[data-jr-key="${CSS.escape(selection.elementId)}"]`);
    if (!(node instanceof HTMLElement)) return;
    const canvasRect = root.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    onCollabPointerMove(
      nodeRect.left - canvasRect.left + root.scrollLeft + nodeRect.width / 2,
      nodeRect.top - canvasRect.top + root.scrollTop + 24,
    );
  }, [onCollabPointerMove, selection]);

  useLayoutEffect(() => {
    if (!selection) {
      lastScrolledSelectionRef.current = null;
      return;
    }
    if (lastScrolledSelectionRef.current === selection.elementId) return;

    const root = canvasRef.current;
    if (!root) return;

    const selected = root.querySelector(`[data-jr-key="${CSS.escape(selection.elementId)}"]`);
    if (selected instanceof HTMLElement) {
      lastScrolledSelectionRef.current = selection.elementId;
      selected.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [selection]);

  useLayoutEffect(() => {
    const root = canvasRef.current;
    if (!root) return;

    if (selectedNodeRef.current) {
      selectedNodeRef.current.removeAttribute("data-editor-selected");
      selectedNodeRef.current.removeAttribute("data-editor-pending");
      selectedNodeRef.current = null;
    }

    if (!selection) return;

    // Re-sync when preview spec re-renders canvas DOM (props, pending block, etc.).
    const previewElement = previewSpec.elements?.[selection.elementId];
    if (!previewElement && selection.elementId !== pendingElementId) return;

    const selected = root.querySelector(`[data-jr-key="${CSS.escape(selection.elementId)}"]`);
    if (selected instanceof HTMLElement) {
      selected.setAttribute("data-editor-selected", "true");
      if (pendingElementId && selection.elementId === pendingElementId) {
        selected.setAttribute("data-editor-pending", "true");
      }
      selectedNodeRef.current = selected;
    }

    const canvasRoot = canvasRef.current;
    const chipNode = selectedNodeRef.current;
    if (!canvasRoot || !chipNode || !selection) {
      setSelectionChip(null);
      return;
    }

    const canvasRect = canvasRoot.getBoundingClientRect();
    const nodeRect = chipNode.getBoundingClientRect();
    setSelectionChip({
      top: nodeRect.top - canvasRect.top + canvasRoot.scrollTop + 4,
      left: nodeRect.left - canvasRect.left + canvasRoot.scrollLeft + 4,
      label: blockLabel(selection.componentType, shellLabels),
    });
  }, [previewSpec, selection, pendingElementId, shellLabels]);

  useLayoutEffect(() => {
    const root = canvasRef.current;
    if (!root) return;

    root.querySelectorAll("[data-editor-remote-peer]").forEach((node) => {
      if (node instanceof HTMLElement) {
        node.removeAttribute("data-editor-remote-peer");
        node.style.removeProperty("outline-color");
      }
    });

    for (const peer of collabPeers) {
      if (!peer.selectedElementId) continue;
      const node = root.querySelector(`[data-jr-key="${CSS.escape(peer.selectedElementId)}"]`);
      if (!(node instanceof HTMLElement)) continue;
      if (node.getAttribute("data-editor-selected") === "true") continue;
      node.setAttribute("data-editor-remote-peer", peer.peerId);
      node.style.outlineColor = peerPresenceColor(peer.peerId);
    }
  }, [collabPeers]);

  useLayoutEffect(() => {
    const root = canvasRef.current;
    if (!root || !storedSpec) return;

    root.querySelectorAll("[data-editor-drop-zone]").forEach((node) => {
      node.removeAttribute("data-editor-drop-zone");
      node.removeAttribute("data-editor-drop-target");
    });

    if (!isDragging) return;

    for (const id of listDropTargetIds(storedSpec)) {
      const node = root.querySelector(`[data-jr-key="${CSS.escape(id)}"]`);
      if (node instanceof HTMLElement) {
        node.setAttribute("data-editor-drop-zone", "true");
      }
    }

    if (!dropIndicator) return;

    const target = root.querySelector(`[data-jr-key="${CSS.escape(dropIndicator.parentId)}"]`);
    if (target instanceof HTMLElement) {
      target.setAttribute("data-editor-drop-target", "true");
    }
  }, [isDragging, dropIndicator, storedSpec]);

  const selectBlockFromTarget = useCallback(
    (target: EventTarget | null) => {
      const node = (target as HTMLElement | null)?.closest("[data-jr-key]");
      if (!(node instanceof HTMLElement)) return;
      const elementId = node.getAttribute("data-jr-key");
      if (!elementId) return;

      if (pendingElementId && elementId === pendingElementId && pendingComponentType) {
        if (
          selection?.elementId === elementId &&
          selection.componentType === pendingComponentType
        ) {
          return;
        }
        onSelect({ elementId, componentType: pendingComponentType });
        return;
      }

      if (!storedSpec) return;
      const el = getElement(storedSpec, elementId);
      if (!el) {
        if (pendingElementId && pendingComponentType) {
          if (
            selection?.elementId === pendingElementId &&
            selection.componentType === pendingComponentType
          ) {
            return;
          }
          onSelect({ elementId: pendingElementId, componentType: pendingComponentType });
        }
        return;
      }
      if (selection?.elementId === elementId && selection.componentType === el.type) {
        return;
      }
      onSelect({ elementId, componentType: el.type });
    },
    [storedSpec, onSelect, pendingElementId, pendingComponentType, selection],
  );

  const handleClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (suppressClickAfterDropRef.current) {
        suppressClickAfterDropRef.current = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      canvasRef.current?.focus();

      const node = (event.target as HTMLElement | null)?.closest("[data-jr-key]");
      if (!(node instanceof HTMLElement) || !storedSpec) {
        selectBlockFromTarget(event.target);
        return;
      }

      const elementId = node.getAttribute("data-jr-key");
      if (!elementId) return;

      const now = Date.now();
      const repeatClick =
        event.shiftKey ||
        (lastClickRef.current?.elementId === elementId && now - lastClickRef.current.at < 500);

      if (repeatClick && elementId !== storedSpec.root) {
        const parentId = findParentId(storedSpec, elementId);
        if (parentId) {
          const parentEl = getElement(storedSpec, parentId);
          if (parentEl) {
            lastClickRef.current = { elementId: parentId, at: now };
            onSelect({ elementId: parentId, componentType: parentEl.type });
            return;
          }
        }
      }

      lastClickRef.current = { elementId, at: now };
      selectBlockFromTarget(event.target);
    },
    [selectBlockFromTarget, storedSpec, onSelect],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        if (event.shiftKey) {
          if (!canRedo || !onRedo) return;
          event.preventDefault();
          onRedo();
          return;
        }
        if (!canUndo || !onUndo) return;
        event.preventDefault();
        onUndo();
        return;
      }
      if (event.key === "Escape") {
        onClearSelection();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "d") {
        if (!selection || !onDuplicate || !storedSpec) return;
        if (pendingElementId && selection.elementId === pendingElementId) return;
        if (!canRemoveElement(storedSpec, selection.elementId)) return;
        event.preventDefault();
        onDuplicate(selection.elementId);
        return;
      }
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (!selection) return;
      if (pendingElementId && selection.elementId === pendingElementId) {
        event.preventDefault();
        onDelete(selection.elementId);
        return;
      }
      if (!storedSpec) return;
      if (!canRemoveElement(storedSpec, selection.elementId)) return;
      event.preventDefault();
      onDelete(selection.elementId);
    },
    [
      onClearSelection,
      onDelete,
      onDuplicate,
      onRedo,
      onUndo,
      canRedo,
      canUndo,
      selection,
      storedSpec,
      pendingElementId,
    ],
  );

  const updateDropPreview = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const root = canvasRef.current;
      if (!storedSpec || !root) {
        setDropIndicator(null);
        return;
      }
      setIsDragging(true);
      const componentType = getEditorDragComponentType();
      const target = dragTargetFromEvent(event, root);
      const placement = resolveDropPlacement(
        storedSpec,
        target,
        root,
        event.clientX,
        event.clientY,
      );
      if (!placement) {
        setDropIndicator(null);
        return;
      }
      const rect = dropIndicatorRect(storedSpec, root, placement);
      const ghostRect = dropGhostRect(storedSpec, root, placement);
      if (!rect || !ghostRect) {
        setDropIndicator(null);
        return;
      }
      setDropIndicator({
        ...placement,
        rect,
        ghostRect,
        label: buildDropLabel(storedSpec, placement, componentType, shellLabels),
        ghostLabel: blockLabel(componentType, shellLabels),
      });
    },
    [storedSpec, shellLabels],
  );

  const clearDropPreview = useCallback(() => {
    setIsDragging(false);
    setDropIndicator(null);
  }, []);

  const isPaletteDrag = useCallback((event: DragEvent<HTMLDivElement>) => {
    const types = event.dataTransfer.types;
    return types.includes(EDITOR_DRAG_MIME) || types.includes(PALETTE_DRAG_MIME);
  }, []);

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      if (!isPaletteDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      updateDropPreview(event);
    },
    [isPaletteDrag, updateDropPreview],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      const componentType =
        event.dataTransfer.getData(EDITOR_DRAG_MIME) ||
        event.dataTransfer.getData(PALETTE_DRAG_MIME) ||
        getEditorDragComponentType();
      if (!componentType || !storedSpec) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickAfterDropRef.current = true;
      const root = canvasRef.current;
      const target = root ? dragTargetFromEvent(event, root) : event.target;
      const placement = root
        ? resolveDropPlacement(storedSpec, target, root, event.clientX, event.clientY)
        : null;
      onAdd(componentType, placement?.parentId, placement?.insertIndex);
      setEditorDragComponentType(null);
      clearDropPreview();
    },
    [storedSpec, onAdd, clearDropPreview],
  );

  const emptyTarget =
    dropIndicator &&
    storedSpec &&
    (getElement(storedSpec, dropIndicator.parentId)?.children?.length ?? 0) === 0;

  const previewMaxWidth = canvasPreview === "full" ? undefined : PREVIEW_MAX_WIDTH[canvasPreview];

  return (
    <div
      ref={canvasRef}
      role="application"
      tabIndex={-1}
      aria-label={shellLabels.canvasAriaLabel}
      className={`editor-canvas editor-canvas--${canvasPreview} relative min-h-0 flex-1 overflow-y-auto`}
      style={
        previewMaxWidth
          ? { maxWidth: previewMaxWidth, marginInline: "auto", width: "100%" }
          : undefined
      }
      data-canvas-drag-over={isDragging ? "true" : undefined}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onDragOver={handleDragOver}
      onDragEnter={handleDragOver}
      onDragLeave={(event) => {
        if (!canvasRef.current?.contains(event.relatedTarget as Node)) {
          clearDropPreview();
        }
      }}
      onDrop={handleDrop}
      onMouseMove={onCollabPointerMove ? handleCollabPointerMove : undefined}
      onMouseLeave={onCollabPointerMove ? handleCollabPointerLeave : undefined}
    >
      <CatalogUiShell key={specStructureKey(previewSpec)} spec={previewSpec} registry={registry} />

      {selectionChip ? (
        <div
          className="editor-selection-chip pointer-events-none absolute"
          style={{ top: selectionChip.top, left: selectionChip.left }}
          aria-hidden
        >
          {selectionChip.label}
        </div>
      ) : null}

      {dropIndicator ? (
        <>
          <div
            className="editor-drop-ghost pointer-events-none absolute z-20 flex items-center justify-center"
            style={{
              top: dropIndicator.ghostRect.top,
              left: dropIndicator.ghostRect.left,
              width: dropIndicator.ghostRect.width,
              height: dropIndicator.ghostRect.height,
            }}
            aria-hidden
          >
            <span className="editor-drop-ghost-label">+ {dropIndicator.ghostLabel}</span>
          </div>
          {!emptyTarget ? (
            <div
              className="editor-drop-indicator pointer-events-none absolute z-20"
              style={{
                top: dropIndicator.rect.top,
                left: dropIndicator.rect.left,
                width: dropIndicator.rect.width,
                height: dropIndicator.rect.height,
              }}
              aria-hidden
            />
          ) : null}
          <div
            className="editor-drop-label pointer-events-none absolute z-30"
            style={{
              top: Math.max(dropIndicator.ghostRect.top - 28, 4),
              left: dropIndicator.ghostRect.left,
            }}
          >
            {dropIndicator.label}
          </div>
        </>
      ) : null}

      <CollabRemoteCursors peers={collabPeers} labels={shellLabels} />
    </div>
  );
}
