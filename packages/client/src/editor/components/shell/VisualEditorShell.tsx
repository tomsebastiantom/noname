import { Children } from "react";
import type { ComponentCtx } from "../../../core/components/types";
import type { CatalogProps } from "../../../schemas/shared";
import {
  useEditorSession,
  useEditorSessionActions,
  useEditorSessionData,
} from "../../hooks/editor-session";
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
  const { registry, shellLabels } = useEditorSessionData();
  const { stageAdd } = useEditorSessionActions();
  return <ComponentPalette registry={registry} labels={shellLabels} onAdd={stageAdd} />;
}

export function EditorLayerTreeSlot() {
  const { shellLabels, previewSpec, storedSpec, selection, pendingAdd } = useEditorSessionData();
  const { isStoredElement, setSelection, handleReorder } = useEditorSessionActions();
  return (
    <LayerTreePanel
      hideHeader
      labels={shellLabels}
      displaySpec={previewSpec}
      structureSpec={storedSpec ?? previewSpec}
      selection={selection}
      pendingElementId={pendingAdd?.tempElementId ?? null}
      isStoredElement={isStoredElement}
      onSelect={setSelection}
      onReorder={handleReorder}
    />
  );
}

export function EditorCanvasSlot() {
  const {
    previewSpec,
    registry,
    storedSpec,
    pendingAdd,
    selection,
    shellLabels,
    canUndo,
    canRedo,
  } = useEditorSessionData();
  const { undo, redo, setSelection, stageAdd, handleDelete, handleDuplicate } =
    useEditorSessionActions();
  const { layout } = useEditorPrefs();
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <EditorCanvasPreviewBar labels={shellLabels} />
      <EditorCanvas
        previewSpec={previewSpec}
        registry={registry}
        storedSpec={storedSpec}
        pendingElementId={pendingAdd?.tempElementId ?? null}
        pendingComponentType={pendingAdd?.componentType ?? null}
        selection={selection}
        shellLabels={shellLabels}
        canvasPreview={layout.canvasPreview}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onSelect={setSelection}
        onClearSelection={() => setSelection(null)}
        onAdd={stageAdd}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
      />
    </div>
  );
}

export function EditorPropsPanelSlot() {
  const { selection, storedSpec, pendingAdd, contentDraft, shellLabels } = useEditorSessionData();
  const {
    handleStoredChange,
    patchPendingProps,
    handleSave,
    cancelPendingAdd,
    handleDelete,
    handleDuplicate,
  } = useEditorSessionActions();
  return (
    <PropsPanel
      selection={selection}
      storedSpec={storedSpec}
      pendingAdd={pendingAdd}
      contentDraft={contentDraft}
      shellLabels={shellLabels}
      onChangeSpec={handleStoredChange}
      onPatchPending={patchPendingProps}
      onSavePending={handleSave}
      onCancelPending={cancelPendingAdd}
      onDelete={handleDelete}
      onDuplicate={handleDuplicate}
    />
  );
}
