import { Children } from "react";
import type { ComponentCtx } from "../../../core/components/types";
import type { CatalogProps } from "../../../schemas/shared";
import { useEditorSession } from "../../hooks/editor-session";
import { useEditorPrefs } from "../../hooks/use-editor-prefs";
import { editorShellLabelsSchema } from "../../schemas/components";
import { EditorCanvas } from "../canvas/EditorCanvas";
import { EditorCanvasPreviewBar } from "../canvas/EditorCanvasPreviewBar";
import { LayerTreePanel } from "../layers/LayerTreePanel";
import { ComponentPalette } from "../palette/ComponentPalette";
import { PropsPanel } from "../panel/PropsPanel";
import { EditorChromeRail } from "./EditorChromeRail";
import { EditorLayout } from "./EditorLayout";
import { EditorScopeBanner } from "./EditorScopeBanner";
import { SaveBar } from "./SaveBar";

type VisualEditorShellConfig = {
  templateName: string;
  pageContentRef: string | null;
};

function EditorTopChrome() {
  const session = useEditorSession();
  const { layout, setLayout } = useEditorPrefs();
  const { shellLabels: labels } = session;

  if (layout.chromeOpen) {
    return (
      <>
        <SaveBar
          dirty={session.dirty}
          status={session.draftStatus}
          canPublish={session.canPublish}
          hasPendingBlock={session.pendingAdd !== null}
          error={session.chromeError}
          success={session.saveSuccess}
          saveConflict={session.saveConflict}
          labels={labels}
          onSave={session.handleSave}
          onPublish={session.handlePublish}
          onDiscard={session.handleDiscard}
          onExitEdit={session.exitEditMode}
          onRefreshConflict={session.handleRefreshConflict}
          onCollapse={() => setLayout((current) => ({ ...current, chromeOpen: false }))}
        />
        <EditorScopeBanner
          templateName={session.templateName}
          pageContentRef={session.pageContentRef}
          labels={labels}
        />
      </>
    );
  }

  return (
    <EditorChromeRail
      dirty={session.dirty}
      hasError={Boolean(session.chromeError)}
      labels={labels}
      onExpand={() => setLayout((current) => ({ ...current, chromeOpen: true }))}
      onExitEdit={session.exitEditMode}
      onSave={session.handleSave}
    />
  );
}

/** Spec-driven editor chrome — maps json-render slot children to layout zones. */
export function VisualEditorShell({
  props,
  children,
}: ComponentCtx<CatalogProps<VisualEditorShellConfig, Record<string, unknown>>>) {
  const session = useEditorSession();
  const labels = editorShellLabelsSchema.parse(props.labels ?? session.shellLabels);

  const [palette, layers, canvas, panel] = Children.toArray(children);

  return (
    <div className="editor-page flex min-h-0 flex-1 flex-col overflow-hidden">
      <EditorTopChrome />
      <EditorLayout
        shellLabels={labels}
        palette={palette ?? <EditorPaletteSlot />}
        layers={layers ?? <EditorLayerTreeSlot />}
        canvas={canvas ?? <EditorCanvasSlot />}
        panel={panel ?? <EditorPropsPanelSlot />}
      />
    </div>
  );
}

VisualEditorShell.displayName = "VisualEditorShell";

export function EditorPaletteSlot() {
  const session = useEditorSession();
  return (
    <ComponentPalette
      registry={session.registry}
      labels={session.shellLabels}
      onAdd={session.stageAdd}
    />
  );
}
EditorPaletteSlot.displayName = "EditorPalette";

export function EditorLayerTreeSlot() {
  const session = useEditorSession();
  return (
    <LayerTreePanel
      hideHeader
      labels={session.shellLabels}
      displaySpec={session.previewSpec}
      structureSpec={session.storedSpec ?? session.previewSpec}
      selection={session.selection}
      pendingElementId={session.pendingAdd?.tempElementId ?? null}
      isStoredElement={session.isStoredElement}
      onSelect={session.setSelection}
      onReorder={session.handleReorder}
    />
  );
}
EditorLayerTreeSlot.displayName = "EditorLayerTree";

export function EditorCanvasSlot() {
  const session = useEditorSession();
  const { layout } = useEditorPrefs();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <EditorCanvasPreviewBar labels={session.shellLabels} />
      <EditorCanvas
        previewSpec={session.previewSpec}
        registry={session.registry}
        storedSpec={session.storedSpec}
        pendingElementId={session.pendingAdd?.tempElementId ?? null}
        pendingComponentType={session.pendingAdd?.componentType ?? null}
        selection={session.selection}
        shellLabels={session.shellLabels}
        canvasPreview={layout.canvasPreview}
        canUndo={session.canUndo}
        canRedo={session.canRedo}
        onUndo={session.undo}
        onRedo={session.redo}
        onSelect={session.setSelection}
        onClearSelection={() => session.setSelection(null)}
        onAdd={session.stageAdd}
        onDelete={session.handleDelete}
        onDuplicate={session.handleDuplicate}
      />
    </div>
  );
}
EditorCanvasSlot.displayName = "EditorCanvas";

export function EditorPropsPanelSlot() {
  const session = useEditorSession();
  return (
    <PropsPanel
      selection={session.selection}
      storedSpec={session.storedSpec}
      pendingAdd={session.pendingAdd}
      contentDraft={session.contentDraft}
      shellLabels={session.shellLabels}
      onChangeSpec={session.handleStoredChange}
      onPatchPending={session.patchPendingProps}
      onSavePending={session.handleSave}
      onCancelPending={session.cancelPendingAdd}
      onDelete={session.handleDelete}
      onDuplicate={session.handleDuplicate}
    />
  );
}
EditorPropsPanelSlot.displayName = "EditorPropsPanel";
