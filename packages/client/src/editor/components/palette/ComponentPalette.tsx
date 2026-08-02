import type { ComponentRegistry } from "@json-render/react";
import { type DragEvent, useCallback, useMemo, useState } from "react";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { getEditorDragComponentType, setEditorDragComponentType } from "../../editor-drag-state";
import { usePalettePins } from "../../hooks/use-palette-pins";
import { editMetaForType, paletteCatalogForRegistry } from "../../lib/edit-metadata";
import type { PaletteItem } from "../../lib/types";
import { EDITOR_DRAG_MIME, PALETTE_DRAG_MIME } from "../../lib/types";
import type { EditorShellLabels } from "../../schemas/components";

function matchesQuery(item: PaletteItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return item.label.toLowerCase().includes(q) || item.componentType.toLowerCase().includes(q);
}

function setPaletteDragData(event: DragEvent<HTMLButtonElement>, componentType: string): void {
  setEditorDragComponentType(componentType);
  event.dataTransfer.setData(EDITOR_DRAG_MIME, componentType);
  event.dataTransfer.setData(PALETTE_DRAG_MIME, componentType);
  event.dataTransfer.effectAllowed = "copy";
}

function readPaletteDragType(event: DragEvent<HTMLElement>): string | null {
  return (
    event.dataTransfer.getData(PALETTE_DRAG_MIME) ||
    event.dataTransfer.getData(EDITOR_DRAG_MIME) ||
    getEditorDragComponentType()
  );
}

function paletteItemTitle(item: PaletteItem, canAdd: boolean, labels: EditorShellLabels): string {
  if (!canAdd) {
    const lead = item.description
      ? `${item.componentType} — ${item.description}. `
      : `${item.componentType} — `;
    return `${lead}${labels.palettePinOnlyHint}`;
  }
  if (item.description) {
    return `${item.componentType}: ${item.description}`;
  }
  return `${labels.paletteDragToAddHint} ${item.label}`;
}

function PaletteBlockButton({
  item,
  labels,
  onAdd,
  className,
}: {
  item: PaletteItem;
  labels: EditorShellLabels;
  onAdd: (componentType: string) => void;
  className?: string;
}) {
  const canAdd = item.configured;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      draggable
      title={paletteItemTitle(item, canAdd, labels)}
      className={`cursor-grab justify-start text-left active:cursor-grabbing ${!canAdd ? "opacity-60" : ""} ${className ?? "w-full"}`}
      onDragStart={(event) => setPaletteDragData(event, item.componentType)}
      onDragEnd={() => setEditorDragComponentType(null)}
      onClick={() => {
        if (canAdd) onAdd(item.componentType);
      }}
    >
      + {item.label}
    </Button>
  );
}

function PinnedBlockRow({
  item,
  labels,
  onAdd,
  onUnpin,
}: {
  item: PaletteItem;
  labels: EditorShellLabels;
  onAdd: (componentType: string) => void;
  onUnpin: (componentType: string) => void;
}) {
  const unpinLabel = `${labels.paletteUnpinLabel} ${item.label}`;

  return (
    <li className="relative">
      <PaletteBlockButton item={item} labels={labels} onAdd={onAdd} className="w-full" />
      <div
        className="absolute inset-y-0 right-0 z-10 w-5 opacity-0 transition-opacity hover:opacity-100 focus-within:opacity-100"
        title={unpinLabel}
      >
        <button
          type="button"
          className="editor-palette-unpin flex h-full w-full items-center justify-center rounded-r-md border-l border-border/50 bg-muted/90 text-sm leading-none text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label={unpinLabel}
          onClick={(event) => {
            event.stopPropagation();
            onUnpin(item.componentType);
          }}
        >
          ×
        </button>
      </div>
    </li>
  );
}

export function ComponentPalette({
  registry,
  labels,
  onAdd,
}: {
  registry: ComponentRegistry;
  labels: EditorShellLabels;
  onAdd: (componentType: string, parentId?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const { pinnedTypes, pin, unpin, ready: pinsReady } = usePalettePins(registry);
  const [pinDropActive, setPinDropActive] = useState(false);

  const catalog = useMemo(
    () => paletteCatalogForRegistry(registry, pinnedTypes),
    [registry, pinnedTypes],
  );
  const searchActive = query.trim().length > 0;

  const visibleBlocks = useMemo(() => {
    if (!searchActive) return catalog.blocks;
    return catalog.blocks.filter((item) => matchesQuery(item, query));
  }, [catalog.blocks, query, searchActive]);

  const showEmptySearch = searchActive && visibleBlocks.length === 0;
  const totalCatalogCount = catalog.pinned.length + catalog.blocks.length;

  const handlePinDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    const types = event.dataTransfer.types;
    if (!types.includes(PALETTE_DRAG_MIME) && !types.includes(EDITOR_DRAG_MIME)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
    setPinDropActive(true);
  }, []);

  const handlePinDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      const componentType = readPaletteDragType(event);
      if (componentType) pin(componentType);
      setPinDropActive(false);
    },
    [pin],
  );

  return (
    <aside className="flex w-full flex-col bg-muted/20">
      <div className="shrink-0 space-y-1 border-b p-3">
        <p className="text-xs text-muted-foreground">
          {totalCatalogCount} {labels.paletteCatalogSuffix}
        </p>
      </div>

      <section
        aria-label={labels.palettePinnedAriaLabel}
        className={`shrink-0 space-y-1.5 border-b p-3 transition-colors ${pinDropActive ? "border-primary bg-primary/10 ring-2 ring-inset ring-primary/30" : ""}`}
        onDragOver={handlePinDragOver}
        onDragEnter={handlePinDragOver}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setPinDropActive(false);
          }
        }}
        onDrop={handlePinDrop}
      >
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {labels.palettePinnedTitle}
        </p>
        {catalog.pinned.length > 0 ? (
          <ul className="space-y-1">
            {catalog.pinned.map((item) => (
              <PinnedBlockRow
                key={item.componentType}
                item={item}
                labels={labels}
                onAdd={(type) => onAdd(type)}
                onUnpin={unpin}
              />
            ))}
          </ul>
        ) : pinsReady ? (
          <p className="text-xs text-muted-foreground">{labels.palettePinnedEmpty}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{labels.palettePinsLoading}</p>
        )}
      </section>

      <section className="shrink-0 space-y-2 p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {labels.paletteAllBlocksTitle}
        </p>
        <Input
          type="search"
          placeholder={labels.paletteFilterPlaceholder}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-8 text-sm"
          aria-label={labels.paletteFilterAriaLabel}
        />
        {visibleBlocks.length > 0 ? (
          <ul className="space-y-1">
            {visibleBlocks.map((item) => (
              <li key={item.componentType}>
                <PaletteBlockButton item={item} labels={labels} onAdd={(type) => onAdd(type)} />
              </li>
            ))}
          </ul>
        ) : showEmptySearch ? (
          <p className="text-xs text-muted-foreground">
            {labels.paletteNoMatchPrefix} “{query.trim()}”.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">{labels.paletteAllPinnedHint}</p>
        )}
      </section>
    </aside>
  );
}

export function defaultPropsForType(componentType: string) {
  const meta = editMetaForType(componentType);
  if (!meta?.defaultProps) return null;
  return {
    defaultProps: meta.defaultProps,
    preferredParentType: meta.preferredParentType,
  };
}
