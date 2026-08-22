import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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

/** Edge labels hidden while that panel is open. */
function RightActivityRail({
  propsOpen,
  agentOpen,
  labels,
  onToggleProps,
  onToggleAgent,
}: {
  propsOpen: boolean;
  agentOpen: boolean;
  labels: EditorShellLabels;
  onToggleProps: () => void;
  onToggleAgent: () => void;
}) {
  const showProps = !propsOpen;
  const showAgent = !agentOpen;
  if (!showProps && !showAgent) return null;

  return (
    <aside
      className={`editor-layout-rail editor-layout-rail--right editor-layout-rail--persistent${showProps && showAgent ? " editor-layout-rail--dual" : ""}`}
      aria-label={labels.rightPanelsAriaLabel}
    >
      {showProps ? (
        <button type="button" className="editor-layout-rail-button" onClick={onToggleProps}>
          {labels.propertiesPanelTitle}
        </button>
      ) : null}
      {showAgent ? (
        <button type="button" className="editor-layout-rail-button" onClick={onToggleAgent}>
          {labels.openAgentPanelLabel}
        </button>
      ) : null}
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
  agentPanel,
  shellLabels,
}: {
  palette: ReactNode;
  layers: ReactNode;
  canvas: ReactNode;
  panel: ReactNode;
  agentPanel: ReactNode;
  shellLabels: EditorShellLabels;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { layout: prefs, setLayout: setPrefs, setLayoutPersist: persistPrefs } = useEditorPrefs();
  const [activeEdge, setActiveEdge] = useState<"palette" | "props" | null>(null);
  const dragRef = useRef<"palette" | "props" | null>(null);

  const blocksOpen = prefs.paletteOpen;
  const layersOpen = prefs.layersOpen;
  const leftPanelOpen = blocksOpen || layersOpen;
  const rightPanelOpen = prefs.propsOpen || prefs.agentOpen;

  const toggleBlocks = useCallback(() => {
    persistPrefs((current) => ({ ...current, paletteOpen: !current.paletteOpen }));
  }, [persistPrefs]);

  const toggleLayers = useCallback(() => {
    persistPrefs((current) => ({ ...current, layersOpen: !current.layersOpen }));
  }, [persistPrefs]);

  const toggleProps = useCallback(() => {
    persistPrefs((current) => {
      const opening = !current.propsOpen;
      return {
        ...current,
        propsOpen: opening,
        agentOpen: opening ? false : current.agentOpen,
      };
    });
  }, [persistPrefs]);

  const toggleAgent = useCallback(() => {
    persistPrefs((current) => {
      const opening = !current.agentOpen;
      return {
        ...current,
        agentOpen: opening,
        propsOpen: opening ? false : current.propsOpen,
      };
    });
  }, [persistPrefs]);

  const closeRightPanel = useCallback(() => {
    persistPrefs((current) => ({
      ...current,
      propsOpen: false,
      agentOpen: false,
    }));
  }, [persistPrefs]);

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
          onBlocksOpenChange={(open) => persistPrefs((p) => ({ ...p, paletteOpen: open }))}
          onLayersOpenChange={(open) => persistPrefs((p) => ({ ...p, layersOpen: open }))}
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
          onClose={() => persistPrefs((p) => ({ ...p, paletteOpen: false }))}
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
          onClose={() => persistPrefs((p) => ({ ...p, layersOpen: false }))}
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
            className="editor-layout-panel editor-layout-panel--side editor-layout-panel--left border-r border-border"
            style={
              {
                "--editor-panel-w": `min(${prefs.paletteWidth}px, 38vw)`,
                "--editor-panel-min": `${EDITOR_LAYOUT_LIMITS.paletteMin}px`,
              } as CSSProperties
            }
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

      <div
        className="editor-layout-canvas flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        style={{ "--editor-canvas-min": `${EDITOR_LAYOUT_LIMITS.canvasMin}px` } as CSSProperties}
      >
        {canvas}
      </div>

      {rightPanelOpen ? (
        <>
          <ResizeHandle
            active={activeEdge === "props"}
            ariaLabel={shellLabels.resizePanelAriaLabel}
            onPointerDown={startResize("props")}
          />
          <aside
            className="editor-layout-panel editor-layout-panel--side editor-layout-panel--right border-l border-border"
            style={
              {
                "--editor-panel-w": `min(${prefs.propsWidth}px, 38vw)`,
                "--editor-panel-min": `${EDITOR_LAYOUT_LIMITS.propsMin}px`,
              } as CSSProperties
            }
          >
            <PanelHeader
              title={
                prefs.agentOpen ? shellLabels.agentPanelTitle : shellLabels.propertiesPanelTitle
              }
              closeLabel={shellLabels.closePanelLabel}
              onClose={closeRightPanel}
            />
            <div
              className={
                prefs.agentOpen
                  ? "editor-layout-panel-body editor-layout-panel-body--agent"
                  : "editor-layout-panel-body overflow-y-auto"
              }
            >
              {prefs.agentOpen ? agentPanel : panel}
            </div>
          </aside>
        </>
      ) : null}

      <RightActivityRail
        propsOpen={prefs.propsOpen}
        agentOpen={prefs.agentOpen}
        labels={shellLabels}
        onToggleProps={toggleProps}
        onToggleAgent={toggleAgent}
      />
    </div>
  );
}
