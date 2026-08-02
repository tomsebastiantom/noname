import type { Spec } from "@json-render/core";
import { type DragEvent, useCallback, useState } from "react";
import { Button } from "../../../components/ui/button";
import { useEditorPrefs } from "../../hooks/use-editor-prefs";
import { componentAcceptsChildren } from "../../lib/catalog-slots";
import { editMetaForType } from "../../lib/edit-metadata";
import { getElement, type LayerReorderPlacement } from "../../lib/spec-utils";
import type { EditSelection } from "../../lib/types";
import type { EditorShellLabels } from "../../schemas/components";

import "./layer-tree.css";

export const LAYER_TREE_DRAG_MIME = "application/x-noname-layer-id";

type DropHint = {
  targetId: string;
  placement: LayerReorderPlacement;
};

function componentLabel(componentType: string): string {
  return editMetaForType(componentType)?.label ?? componentType;
}

function fillLabelTemplate(template: string, label: string): string {
  return template.replace("{label}", label);
}

function LayerChevronIcon({
  expanded,
  labels,
}: Readonly<{ expanded: boolean; labels: EditorShellLabels }>) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="layer-tree-chevron-icon"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{expanded ? labels.layerTreeExpandedTitle : labels.layerTreeCollapsedTitle}</title>
      {expanded ? <path d="M4 6l4 4 4-4" /> : <path d="M6 4l4 4-4 4" />}
    </svg>
  );
}

function isDescendant(spec: Spec, ancestorId: string, candidateId: string): boolean {
  if (ancestorId === candidateId) return true;
  for (const childId of getElement(spec, ancestorId)?.children ?? []) {
    if (isDescendant(spec, childId, candidateId)) return true;
  }
  return false;
}

function resolveLayerDrop(
  structureSpec: Spec,
  dragId: string,
  targetId: string,
  offsetY: number,
  rowHeight: number,
): DropHint | null {
  if (dragId === targetId) return null;
  if (isDescendant(structureSpec, dragId, targetId)) return null;

  const targetEl = getElement(structureSpec, targetId);
  if (!targetEl) return null;

  const canInside = componentAcceptsChildren(targetEl.type);
  const zone = rowHeight / 3;

  if (canInside && offsetY >= zone && offsetY <= zone * 2) {
    return { targetId, placement: "inside" };
  }
  if (offsetY < rowHeight / 2) {
    if (targetId === structureSpec.root)
      return canInside ? { targetId, placement: "inside" } : null;
    return { targetId, placement: "before" };
  }
  if (targetId === structureSpec.root) return null;
  return { targetId, placement: "after" };
}

function LayerTreeRow({
  displaySpec,
  structureSpec,
  elementId,
  depth,
  selected,
  isPending,
  isStored,
  isDragging,
  isCollapsed,
  hasChildren,
  dropHint,
  labels,
  onSelect,
  onToggleCollapsed,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDropRow,
}: {
  displaySpec: Spec;
  structureSpec: Spec;
  elementId: string;
  depth: number;
  selected: boolean;
  isPending: boolean;
  isStored: boolean;
  isDragging: boolean;
  isCollapsed: boolean;
  hasChildren: boolean;
  dropHint: DropHint | null;
  labels: EditorShellLabels;
  onSelect: (selection: EditSelection) => void;
  onToggleCollapsed: (elementId: string) => void;
  onDragStart: (elementId: string) => void;
  onDragEnd: () => void;
  onDragOverRow: (elementId: string, event: DragEvent<HTMLDivElement>) => void;
  onDropRow: (elementId: string, event: DragEvent<HTMLDivElement>) => void;
}) {
  const el = getElement(displaySpec, elementId);
  if (!el) return null;

  const isRoot = elementId === structureSpec.root;
  const canDrag = isStored && !isRoot;
  const typeLabel = componentLabel(el.type);

  const dropClass =
    dropHint?.targetId === elementId ? ` layer-tree-row--drop-${dropHint.placement}` : "";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: row is a drag-and-drop reorder target
    <div
      className={`layer-tree-row${selected ? " layer-tree-row--selected" : ""}${isPending ? " layer-tree-row--pending" : ""}${isDragging ? " layer-tree-row--dragging" : ""}${dropClass}`}
      style={{ paddingLeft: `${0.5 + depth * 0.75}rem` }}
      onDragOver={(event) => onDragOverRow(elementId, event)}
      onDrop={(event) => onDropRow(elementId, event)}
    >
      {canDrag ? (
        <button
          type="button"
          className="layer-tree-drag-handle"
          draggable
          aria-label={fillLabelTemplate(labels.layerTreeDragTemplate, typeLabel)}
          onDragStart={(event) => {
            event.dataTransfer.setData(LAYER_TREE_DRAG_MIME, elementId);
            event.dataTransfer.effectAllowed = "move";
            onDragStart(elementId);
          }}
          onDragEnd={onDragEnd}
        >
          ⠿
        </button>
      ) : (
        <span className="layer-tree-drag-spacer" aria-hidden />
      )}
      <button
        type="button"
        className="layer-tree-row-label"
        onClick={() => onSelect({ elementId, componentType: el.type })}
      >
        <span className="layer-tree-row-type">{typeLabel}</span>
        <span className="layer-tree-row-id">{elementId}</span>
        {isPending ? (
          <span className="layer-tree-row-badge">{labels.layerTreePendingBadge}</span>
        ) : null}
      </button>
      {hasChildren ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="layer-tree-expand-btn h-7 w-7 shrink-0 p-0"
          aria-expanded={!isCollapsed}
          aria-label={
            isCollapsed
              ? fillLabelTemplate(labels.layerTreeExpandTemplate, typeLabel)
              : fillLabelTemplate(labels.layerTreeCollapseTemplate, typeLabel)
          }
          onClick={(event) => {
            event.stopPropagation();
            onToggleCollapsed(elementId);
          }}
        >
          <LayerChevronIcon expanded={!isCollapsed} labels={labels} />
        </Button>
      ) : (
        <span className="layer-tree-expand-spacer" aria-hidden />
      )}
    </div>
  );
}

function LayerTreeNode({
  displaySpec,
  structureSpec,
  elementId,
  depth,
  selection,
  pendingElementId,
  dragElementId,
  dropHint,
  collapsedIds,
  isStoredElement,
  labels,
  onSelect,
  onToggleCollapsed,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onDropRow,
}: {
  displaySpec: Spec;
  structureSpec: Spec;
  elementId: string;
  depth: number;
  selection: EditSelection | null;
  pendingElementId: string | null;
  dragElementId: string | null;
  dropHint: DropHint | null;
  collapsedIds: ReadonlySet<string>;
  isStoredElement: (id: string) => boolean;
  labels: EditorShellLabels;
  onSelect: (selection: EditSelection) => void;
  onToggleCollapsed: (elementId: string) => void;
  onDragStart: (elementId: string) => void;
  onDragEnd: () => void;
  onDragOverRow: (elementId: string, event: DragEvent<HTMLDivElement>) => void;
  onDropRow: (elementId: string, event: DragEvent<HTMLDivElement>) => void;
}) {
  const el = getElement(displaySpec, elementId);
  if (!el) return null;

  const childIds = el.children ?? [];
  const hasChildren = childIds.length > 0;
  const isCollapsed = collapsedIds.has(elementId);
  const selected = selection?.elementId === elementId;
  const isPending = pendingElementId === elementId;

  return (
    <>
      <LayerTreeRow
        displaySpec={displaySpec}
        structureSpec={structureSpec}
        elementId={elementId}
        depth={depth}
        selected={selected}
        isPending={isPending}
        isStored={isStoredElement(elementId)}
        isDragging={dragElementId === elementId}
        isCollapsed={isCollapsed}
        hasChildren={hasChildren}
        dropHint={dropHint}
        labels={labels}
        onSelect={onSelect}
        onToggleCollapsed={onToggleCollapsed}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOverRow={onDragOverRow}
        onDropRow={onDropRow}
      />
      {hasChildren && !isCollapsed
        ? childIds.map((childId) => (
            <LayerTreeNode
              key={childId}
              displaySpec={displaySpec}
              structureSpec={structureSpec}
              elementId={childId}
              depth={depth + 1}
              selection={selection}
              pendingElementId={pendingElementId}
              dragElementId={dragElementId}
              dropHint={dropHint}
              collapsedIds={collapsedIds}
              isStoredElement={isStoredElement}
              labels={labels}
              onSelect={onSelect}
              onToggleCollapsed={onToggleCollapsed}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDragOverRow={onDragOverRow}
              onDropRow={onDropRow}
            />
          ))
        : null}
    </>
  );
}

export function LayerTreePanel({
  displaySpec,
  structureSpec,
  selection,
  pendingElementId,
  isStoredElement,
  labels,
  onSelect,
  onReorder,
  className,
  hideHeader = false,
}: {
  displaySpec: Spec | null;
  structureSpec: Spec | null;
  selection: EditSelection | null;
  pendingElementId: string | null;
  isStoredElement: (id: string) => boolean;
  labels: EditorShellLabels;
  onSelect: (selection: EditSelection) => void;
  onReorder: (elementId: string, targetId: string, placement: LayerReorderPlacement) => void;
  className?: string;
  hideHeader?: boolean;
}) {
  const { layersTreeCollapsed: collapsedIds, toggleLayerCollapsed: onToggleCollapsed } =
    useEditorPrefs();
  const [dragElementId, setDragElementId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<DropHint | null>(null);

  const toggleCollapsed = onToggleCollapsed;

  const readDragId = useCallback(
    (event: DragEvent<HTMLElement>): string | null => {
      return event.dataTransfer.getData(LAYER_TREE_DRAG_MIME) || dragElementId;
    },
    [dragElementId],
  );

  const handleDragOverRow = useCallback(
    (targetId: string, event: DragEvent<HTMLDivElement>) => {
      if (!structureSpec) return;
      const dragId = readDragId(event);
      if (!dragId) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "move";
      const rect = event.currentTarget.getBoundingClientRect();
      const hint = resolveLayerDrop(
        structureSpec,
        dragId,
        targetId,
        event.clientY - rect.top,
        rect.height,
      );
      setDropHint(hint);
    },
    [structureSpec, readDragId],
  );

  const handleDropRow = useCallback(
    (targetId: string, event: DragEvent<HTMLDivElement>) => {
      if (!structureSpec) return;
      const dragId = readDragId(event);
      if (!dragId) return;
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      const hint =
        dropHint?.targetId === targetId
          ? dropHint
          : resolveLayerDrop(
              structureSpec,
              dragId,
              targetId,
              event.clientY - rect.top,
              rect.height,
            );
      if (hint) {
        onReorder(dragId, hint.targetId, hint.placement);
      }
      setDragElementId(null);
      setDropHint(null);
    },
    [structureSpec, readDragId, dropHint, onReorder],
  );

  const handleDragEnd = useCallback(() => {
    setDragElementId(null);
    setDropHint(null);
  }, []);

  if (!displaySpec?.root || !structureSpec?.root) {
    return (
      <section className={`layer-tree ${className ?? ""}`} aria-label={labels.layerTreeAriaLabel}>
        <p className="layer-tree-empty">{labels.layerTreeEmpty}</p>
      </section>
    );
  }

  if (!getElement(displaySpec, displaySpec.root)) {
    return (
      <section className={`layer-tree ${className ?? ""}`} aria-label={labels.layerTreeAriaLabel}>
        <p className="layer-tree-empty">{labels.layerTreeRootMissing}</p>
      </section>
    );
  }

  return (
    <section
      className={`layer-tree ${className ?? ""}${dragElementId ? " layer-tree--dragging" : ""}`}
      aria-label={labels.layerTreeAriaLabel}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setDropHint(null);
        }
      }}
    >
      {hideHeader ? null : <div className="layer-tree-header">{labels.layersPanelTitle}</div>}
      <p className="layer-tree-hint">{labels.layerTreeHint}</p>
      <LayerTreeNode
        displaySpec={displaySpec}
        structureSpec={structureSpec}
        elementId={displaySpec.root}
        depth={0}
        selection={selection}
        pendingElementId={pendingElementId}
        dragElementId={dragElementId}
        dropHint={dropHint}
        collapsedIds={collapsedIds}
        isStoredElement={isStoredElement}
        labels={labels}
        onSelect={onSelect}
        onToggleCollapsed={toggleCollapsed}
        onDragStart={setDragElementId}
        onDragEnd={handleDragEnd}
        onDragOverRow={handleDragOverRow}
        onDropRow={handleDropRow}
      />
    </section>
  );
}
