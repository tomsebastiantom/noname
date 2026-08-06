import { Children } from "react";
import type { ComponentCtx } from "../../../core/components/types";
import type { CatalogProps } from "../../../schemas/shared";
import { collabHumanDisplayName } from "../../collab/collab-display-name";
import {
  useEditorSession,
  useEditorSessionActions,
  useEditorSessionData,
} from "../../hooks/editor-session";
import { useEditorAgentPanel } from "../../hooks/use-editor-agent-panel";
import { useEditorPrefs } from "../../hooks/use-editor-prefs";
import { editorShellLabelsSchema } from "../../schemas/components";
import { AgentPanel } from "../agent/AgentPanel";
import { EditorCanvas } from "../canvas/EditorCanvas";
import { EditorCanvasPreviewBar } from "../canvas/EditorCanvasPreviewBar";
import { LayerTreePanel } from "../layers/LayerTreePanel";
import { ComponentPalette } from "../palette/ComponentPalette";
import { PropsPanel } from "../panel/PropsPanel";
import { CollabPresenceBar } from "./CollabPresenceBar";
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
          activityLabel={session.lastActivity}
          labels={labels}
          presence={
            session.collabEnabled ? (
              <CollabPresenceBar
                connected={session.collabConnected}
                peers={session.collabPeers}
                selfDisplayName={collabHumanDisplayName()}
                labels={labels}
              />
            ) : null
          }
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
      activityLabel={session.lastActivity}
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
        agentPanel={<EditorAgentPanelSlot />}
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
    collabEnabled,
    collabPeers,
  } = useEditorSessionData();
  const {
    undo,
    redo,
    setSelection,
    stageAdd,
    handleDelete,
    handleDuplicate,
    reportCollabPointerMove,
  } = useEditorSessionActions();
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
        collabPeers={collabEnabled ? collabPeers : []}
        onUndo={undo}
        onRedo={redo}
        onSelect={setSelection}
        onClearSelection={() => setSelection(null)}
        onAdd={stageAdd}
        onDelete={handleDelete}
        onDuplicate={handleDuplicate}
        onCollabPointerMove={collabEnabled ? reportCollabPointerMove : undefined}
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

export function EditorAgentPanelSlot() {
  const session = useEditorSession();
  const { reloadLayoutAfterAgentPatch, applyAgentRevertedLayoutSpec } = useEditorSessionActions();
  const { layout, clearAgentChatForLayout } = useEditorPrefs();
  const layoutDocumentId = session.layoutDocumentId;
  const chatClearedAt = layoutDocumentId
    ? (layout.agentChatClearedAt[layoutDocumentId] ?? null)
    : null;

  const agent = useEditorAgentPanel({
    enabled: layout.agentOpen,
    layoutDocumentId,
    contentDocumentId: session.pageContentRef,
    templateName: session.templateName,
    selectedComponentType: session.selection?.componentType ?? null,
    agentTargetField: session.agentTargetField,
    chatClearedAt,
    onClearChat: () => {
      if (layoutDocumentId) clearAgentChatForLayout(layoutDocumentId);
    },
    onLayoutPatched: reloadLayoutAfterAgentPatch,
    onLayoutReverted: applyAgentRevertedLayoutSpec,
  });

  const agentInPresence =
    session.collabPeers.some((peer) => peer.peerKind === "agent") ||
    Boolean(session.agentTaskActivity);
  const agentTaskRunning =
    Boolean(session.agentTaskActivity) ||
    Object.values(agent.tasksById).some(
      (task) => task.status === "pending" || task.status === "running",
    );

  return (
    <AgentPanel
      labels={session.shellLabels}
      agents={agent.agents}
      loadingAgents={agent.loadingAgents}
      loadingThread={agent.loadingThread}
      agentId={agent.agentId}
      onAgentIdChange={agent.setAgentId}
      prompt={agent.prompt}
      onPromptChange={agent.setPrompt}
      submitting={agent.submitting}
      error={agent.error}
      thread={agent.thread}
      tasksById={agent.tasksById}
      onSubmit={agent.submitPrompt}
      onApprove={agent.approveTask}
      onReject={agent.rejectTask}
      onUndo={agent.rejectTask}
      layoutDocumentId={layoutDocumentId}
      onRetry={agent.retryFailedTask}
      reviewPending={agent.reviewPending}
      threadScrollRef={agent.threadScrollRef}
      threadEndRef={agent.threadEndRef}
      onClearChat={agent.clearChat}
      canClearChat={agent.canClearChat}
      templateName={session.templateName}
      selectedComponentType={session.selection?.componentType ?? null}
      richTextTarget={agent.richTextTarget}
      canSubmit={agent.canSubmit}
      collabConnected={session.collabEnabled && session.collabConnected}
      collabError={session.collabError}
      agentInPresence={agentInPresence}
      agentTaskRunning={agentTaskRunning}
    />
  );
}
