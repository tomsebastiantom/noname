import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { EDITOR_LAYOUT_LIMITS } from "../../editor-layout-prefs";
import { useEditorPrefs } from "../../hooks/use-editor-prefs";
import type { EditorShellLabels } from "../../schemas/components";
import { EditorLeftPanel } from "./EditorLeftPanel";
import { EditorPanelCloseButton } from "./editor-panel-controls";

import "./editor-layout.css";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function PanelHeader({
  title,
  closeLabel,
  onClose,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <div className="editor-layout-panel-header">
      <span className="editor-layout-panel-title">{title}</span>
      <EditorPanelCloseButton label={`${closeLabel} ${title}`} onClick={onClose} />
    </div>
  );
}

/** Edge label hidden while that panel is open — use header × or open the other panel from the rail. */
function LeftActivityRail({
  blocksOpen,
  layersOpen,
  labels,
  onToggleBlocks,
  onToggleLayers,
}: {
  blocksOpen: boolean;
  layersOpen: boolean;
  labels: EditorShellLabels;
  onToggleBlocks: () => void;
  onToggleLayers: () => void;
}) {
  const showBlocks = !blocksOpen;
  const showLayers = !layersOpen;
  if (!showBlocks && !showLayers) return null;

  return (
    <aside
      className={`editor-layout-rail editor-layout-rail--left editor-layout-rail--persistent${showBlocks && showLayers ? " editor-layout-rail--dual" : ""}`}
      aria-label={labels.leftPanelsAriaLabel}
    >
      {showBlocks ? (
        <button type="button" className="editor-layout-rail-button" onClick={onToggleBlocks}>
          {labels.blocksPanelTitle}
        </button>
      ) : null}
      {showLayers ? (
        <button type="button" className="editor-layout-rail-button" onClick={onToggleLayers}>
          {labels.layersPanelTitle}
        </button>
      ) : null}
    </aside>
  );
}

/** Edge label hidden while Properties panel is open. */
function RightActivityRail({
  propsOpen,
  labels,
  onToggleProps,
}: {
  propsOpen: boolean;
  labels: EditorShellLabels;
  onToggleProps: () => void;
}) {
  if (propsOpen) return null;

  return (
    <aside
      className="editor-layout-rail editor-layout-rail--right editor-layout-rail--persistent"
      aria-label={labels.rightPanelsAriaLabel}
    >
      <button type="button" className="editor-layout-rail-button" onClick={onToggleProps}>
        {labels.propertiesPanelTitle}
      </button>
    </aside>
  );
}

function ResizeHandle({
  active,
  ariaLabel,
  onPointerDown,
}: {
  active: boolean;
  ariaLabel: string;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      tabIndex={0}
      aria-label={ariaLabel}
      className="editor-layout-resizer border-0 bg-transparent p-0"
      data-active={active ? "true" : undefined}
      onPointerDown={onPointerDown}
    />
  );
}

export function EditorLayout({
  palette,
  layers,
  canvas,
  panel,
  shellLabels,
}: {
  palette: ReactNode;
  layers: ReactNode;
  canvas: ReactNode;
  panel: ReactNode;
  shellLabels: EditorShellLabels;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { layout: prefs, setLayout: setPrefs } = useEditorPrefs();
  const [activeEdge, setActiveEdge] = useState<"palette" | "props" | null>(null);
  const dragRef = useRef<"palette" | "props" | null>(null);

  const blocksOpen = prefs.paletteOpen;
  const layersOpen = prefs.layersOpen;
  const leftPanelOpen = blocksOpen || layersOpen;

  const toggleBlocks = useCallback(() => {
    setPrefs((current) => ({ ...current, paletteOpen: !current.paletteOpen }));
  }, [setPrefs]);

  const toggleLayers = useCallback(() => {
    setPrefs((current) => ({ ...current, layersOpen: !current.layersOpen }));
  }, [setPrefs]);

  const toggleProps = useCallback(() => {
    setPrefs((current) => ({ ...current, propsOpen: !current.propsOpen }));
  }, [setPrefs]);

  const startResize = useCallback(
    (edge: "palette" | "props") => (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      dragRef.current = edge;
      setActiveEdge(edge);
      event.currentTarget.setPointerCapture(event.pointerId);
      document.body.classList.add("editor-layout--dragging");
    },
    [],
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const edge = dragRef.current;
      if (!edge) return;

      setPrefs((current) => {
        if (edge === "palette") {
          const nextWidth = clamp(
            current.paletteWidth + event.movementX,
            EDITOR_LAYOUT_LIMITS.paletteMin,
            EDITOR_LAYOUT_LIMITS.paletteMax,
          );
          return { ...current, paletteWidth: nextWidth };
        }
        const nextWidth = clamp(
          current.propsWidth - event.movementX,
          EDITOR_LAYOUT_LIMITS.propsMin,
          EDITOR_LAYOUT_LIMITS.propsMax,
        );
        return { ...current, propsWidth: nextWidth };
      });
    };

    const onPointerUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setActiveEdge(null);
      document.body.classList.remove("editor-layout--dragging");
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.body.classList.remove("editor-layout--dragging");
    };
  }, [setPrefs]);

  let leftPanelBody: ReactNode = null;

  if (blocksOpen && layersOpen) {
    leftPanelBody = (
      <div className="editor-layout-panel-body editor-layout-panel-body--stacked">
        <EditorLeftPanel
          layersOpen
          labels={shellLabels}
          onBlocksOpenChange={(open) => setPrefs((p) => ({ ...p, paletteOpen: open }))}
          onLayersOpenChange={(open) => setPrefs((p) => ({ ...p, layersOpen: open }))}
          palette={palette}
          layers={layers}
        />
      </div>
    );
  } else if (blocksOpen) {
    leftPanelBody = (
      <>
        <PanelHeader
          title={shellLabels.blocksPanelTitle}
          closeLabel={shellLabels.closePanelLabel}
          onClose={() => setPrefs((p) => ({ ...p, paletteOpen: false }))}
        />
        <div className="editor-layout-panel-body editor-sidebar-scroll overflow-y-auto">
          {palette}
        </div>
      </>
    );
  } else if (layersOpen) {
    leftPanelBody = (
      <>
        <PanelHeader
          title={shellLabels.layersPanelTitle}
          closeLabel={shellLabels.closePanelLabel}
          onClose={() => setPrefs((p) => ({ ...p, layersOpen: false }))}
        />
        <div className="editor-layout-panel-body editor-sidebar-scroll overflow-y-auto">
          {layers}
        </div>
      </>
    );
  }

  return (
    <div ref={rootRef} className="editor-layout flex flex-1 min-h-0 min-w-0">
      <LeftActivityRail
        blocksOpen={blocksOpen}
        layersOpen={layersOpen}
        labels={shellLabels}
        onToggleBlocks={toggleBlocks}
        onToggleLayers={toggleLayers}
      />

      {leftPanelOpen ? (
        <>
          <aside
            className="editor-layout-panel border-r border-border"
            style={{ width: prefs.paletteWidth }}
          >
            {leftPanelBody}
          </aside>
          <ResizeHandle
            active={activeEdge === "palette"}
            ariaLabel={shellLabels.resizePanelAriaLabel}
            onPointerDown={startResize("palette")}
          />
        </>
      ) : null}

      <div className="editor-layout-canvas flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {canvas}
      </div>

      {prefs.propsOpen ? (
        <>
          <ResizeHandle
            active={activeEdge === "props"}
            ariaLabel={shellLabels.resizePanelAriaLabel}
            onPointerDown={startResize("props")}
          />
          <aside
            className="editor-layout-panel border-l border-border"
            style={{ width: prefs.propsWidth }}
          >
            <PanelHeader
              title={shellLabels.propertiesPanelTitle}
              closeLabel={shellLabels.closePanelLabel}
              onClose={() => setPrefs((p) => ({ ...p, propsOpen: false }))}
            />
            <div className="editor-layout-panel-body">{panel}</div>
          </aside>
        </>
      ) : null}

      <RightActivityRail
        propsOpen={prefs.propsOpen}
        labels={shellLabels}
        onToggleProps={toggleProps}
      />
    </div>
  );
}
