import type { ReactNode } from "react";
import type { EditorShellLabels } from "../../schemas/components";
import { EditorPanelCloseButton } from "./editor-panel-controls";

/** Blocks on top, layers docked below — each section has its own hide control. */
export function EditorLeftPanel({
  layersOpen,
  labels,
  onBlocksOpenChange,
  onLayersOpenChange,
  palette,
  layers,
}: Readonly<{
  layersOpen: boolean;
  labels: EditorShellLabels;
  onBlocksOpenChange: (open: boolean) => void;
  onLayersOpenChange: (open: boolean) => void;
  palette: ReactNode;
  layers: ReactNode;
}>) {
  return (
    <div className="editor-left-panel flex h-full min-h-0 flex-col overflow-hidden">
      <div className="editor-layers-dock-header shrink-0">
        <span className="editor-layers-dock-title">{labels.blocksPanelTitle}</span>
        <EditorPanelCloseButton
          label={labels.hideBlocksLabel}
          onClick={() => onBlocksOpenChange(false)}
        />
      </div>
      <div className="editor-sidebar-scroll min-h-0 flex-1 overflow-y-auto">{palette}</div>
      {layersOpen ? (
        <div className="editor-layers-dock flex max-h-[45%] min-h-0 shrink-0 flex-col border-t border-border">
          <div className="editor-layers-dock-header">
            <span className="editor-layers-dock-title">{labels.layersPanelTitle}</span>
            <EditorPanelCloseButton
              label={labels.hideLayersLabel}
              onClick={() => onLayersOpenChange(false)}
            />
          </div>
          <div className="editor-layers-dock-body editor-sidebar-scroll min-h-0 flex-1 overflow-y-auto">
            {layers}
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="editor-panel-show-bar shrink-0"
          onClick={() => onLayersOpenChange(true)}
        >
          {labels.showLayersLabel}
        </button>
      )}
    </div>
  );
}
