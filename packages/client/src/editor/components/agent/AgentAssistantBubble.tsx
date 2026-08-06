import { useEffect, useMemo, useState } from "react";
import { type AgentTask, parseOrchestrateOutput } from "../../../auth/agents";
import { Button } from "../../../components/ui/button";
import { jaegerTraceUrl, resolveAgentTaskDiagnostics } from "../../agent/agent-task-diagnostics";
import { taskNeedsColdReview, taskShowsLiveUndo } from "../../agent/agent-task-review";
import { formatAgentTaskError } from "../../agent/format-agent-task-error";
import type { EditorShellLabels } from "../../schemas/components";
import { AgentChatAvatar } from "./AgentChatAvatar";
import { AgentFailureDetails } from "./AgentFailureDetails";
import { AgentLiveSteps } from "./AgentLiveSteps";
import { AgentMessageText } from "./AgentMessageText";
import { AgentToolSteps } from "./AgentToolSteps";
import { agentHasLiveProgress, agentLatestStep, agentLiveHeadline } from "./agent-live-activity";

function statusLabel(task: AgentTask, labels: EditorShellLabels): string {
  if (task.status === "pending") return labels.agentStatusPendingLabel;
  if (task.status === "running") return labels.agentStatusRunningLabel;
  if (task.status === "failed") return labels.agentStatusFailedLabel;
  if (task.status === "completed") return labels.agentStatusDoneLabel;
  if (task.status === "approved") return labels.agentApproveLabel;
  if (task.status === "rejected") return labels.agentRejectLabel;
  return task.status;
}

function elapsedSeconds(since: string): number {
  const ms = Date.now() - new Date(since).getTime();
  return Math.max(0, Math.floor(ms / 1000));
}

function AgentTypingIndicator() {
  return (
    <span className="editor-agent-typing" role="status" aria-live="polite">
      <span className="editor-agent-typing-dot" aria-hidden />
      <span className="editor-agent-typing-dot" aria-hidden />
      <span className="editor-agent-typing-dot" aria-hidden />
    </span>
  );
}

function AgentMessageBody({
  task,
  orchestrate,
  running,
  labels,
  onRetry,
  retryPending,
}: Readonly<{
  task: AgentTask;
  orchestrate: ReturnType<typeof parseOrchestrateOutput>;
  running: boolean;
  labels: EditorShellLabels;
  onRetry?: () => void;
  retryPending?: boolean;
}>) {
  if (task.error || task.status === "failed") {
    const diagnostics = resolveAgentTaskDiagnostics(task);
    return (
      <div className="editor-agent-failure">
        <p className="editor-agent-message-text editor-agent-message-text--error">
          {formatAgentTaskError(
            task.error ?? diagnostics.rawError ?? labels.agentStatusFailedLabel,
          )}
        </p>
        {onRetry ? (
          <div className="editor-agent-review-actions">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={retryPending}
              onClick={onRetry}
            >
              {labels.agentRetryLabel}
            </Button>
          </div>
        ) : null}
        <AgentFailureDetails
          taskId={task.id}
          phase={diagnostics.phase}
          executor={diagnostics.executor}
          queue={diagnostics.queue}
          model={task.model}
          traceUrl={diagnostics.traceId ? jaegerTraceUrl(diagnostics.traceId) : null}
          rawError={diagnostics.rawError ?? task.error ?? undefined}
          labels={labels}
        />
      </div>
    );
  }

  if (running) {
    const hasProgress = agentHasLiveProgress(orchestrate);
    const headline = agentLiveHeadline(task, orchestrate, labels);
    const latestStep = agentLatestStep(orchestrate);

    return (
      <div className="editor-agent-working">
        <div className="editor-agent-working-headline">
          {!hasProgress ? <AgentTypingIndicator /> : null}
          <p
            className={`editor-agent-message-text${hasProgress ? " editor-agent-message-text--live" : ""}`}
          >
            {headline}
          </p>
        </div>
        {latestStep && !orchestrate?.summary?.trim() ? (
          <p className="editor-agent-working-subline">
            <span className="editor-agent-step-badge editor-agent-step--ok">{latestStep.tool}</span>
          </p>
        ) : null}
        {orchestrate && orchestrate.steps.length > 0 ? (
          <AgentLiveSteps steps={orchestrate.steps} running={running} />
        ) : null}
        {hasProgress ? <div className="editor-agent-working-shimmer" aria-hidden /> : null}
      </div>
    );
  }

  const summary = orchestrate?.summary?.trim();
  if (summary) {
    return <AgentMessageText text={summary} />;
  }

  return null;
}

export function AgentAssistantBubble({
  task,
  agentLabel,
  labels,
  layoutDocumentId,
  onApprove,
  onReject,
  onUndo,
  onRetry,
  reviewPending,
  retryPending,
}: Readonly<{
  task: AgentTask;
  agentLabel: string;
  labels: EditorShellLabels;
  layoutDocumentId: string | null;
  onApprove: () => void;
  onReject: () => void;
  onUndo: () => void;
  onRetry?: () => void;
  reviewPending: boolean;
  retryPending?: boolean;
}>) {
  const orchestrate = useMemo(() => parseOrchestrateOutput(task.output), [task.output]);
  const running = task.status === "pending" || task.status === "running";
  const liveUndo =
    task.status === "completed" && taskShowsLiveUndo(orchestrate, layoutDocumentId);
  const coldReview =
    task.status === "completed" && taskNeedsColdReview(orchestrate, layoutDocumentId);
  const reviewable = liveUndo || coldReview;
  const chatReply =
    task.status === "completed" && !reviewable && Boolean(orchestrate?.summary?.trim());
  const [elapsed, setElapsed] = useState(() => elapsedSeconds(task.createdAt));

  useEffect(() => {
    if (!running) return;
    setElapsed(elapsedSeconds(task.createdAt));
    const timer = window.setInterval(() => {
      setElapsed(elapsedSeconds(task.createdAt));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, task.createdAt]);

  return (
    <div className="editor-agent-chat-row editor-agent-chat-row--assistant">
      <AgentChatAvatar running={running} />
      <div className="editor-agent-chat-content">
        <div className="editor-agent-chat-meta">
          <span className="editor-agent-chat-name">{agentLabel}</span>
          {running ? (
            <span className="editor-agent-chat-meta-live">
              <span className="editor-agent-chat-live-dot" aria-hidden />
              {elapsed}s
            </span>
          ) : (
            <>
              <span
                className="editor-agent-chat-status"
                data-status={chatReply ? "reply" : task.status}
              >
                {chatReply ? labels.agentStatusReplyLabel : statusLabel(task, labels)}
              </span>
              {task.model ? (
                <span className="editor-agent-chat-meta-muted">{task.model}</span>
              ) : null}
            </>
          )}
        </div>

        <div
          className={`editor-agent-chat-bubble editor-agent-chat-bubble--assistant${running ? " editor-agent-chat-bubble--working" : ""}`}
        >
          <AgentMessageBody
            task={task}
            orchestrate={orchestrate}
            running={running}
            labels={labels}
            onRetry={task.status === "failed" && onRetry ? onRetry : undefined}
            retryPending={retryPending}
          />

          {!running && orchestrate && orchestrate.steps.length > 0 && !reviewable ? (
            <AgentToolSteps steps={orchestrate.steps} labels={labels} />
          ) : null}

          {orchestrate && orchestrate.artifacts.length > 0 && !running && !reviewable ? (
            <div className="editor-agent-artifacts editor-agent-artifacts--inline">
              <p className="editor-agent-tool-feed-label">{labels.agentArtifactsLabel}</p>
              <div className="editor-agent-artifact-chips">
                {orchestrate.artifacts.map((artifact) => (
                  <span key={`${artifact.kind}-${artifact.label}`} className="editor-agent-chip">
                    {artifact.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {reviewable ? (
            <div className="editor-agent-review">
              <p className="editor-agent-review-hint">
                {liveUndo ? labels.agentLiveUndoHint : labels.agentReviewDraftsHint}
              </p>
              <div className="editor-agent-review-actions">
                {liveUndo ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={reviewPending}
                    onClick={onUndo}
                  >
                    {labels.agentUndoLabel}
                  </Button>
                ) : (
                  <>
                    <Button type="button" size="sm" disabled={reviewPending} onClick={onApprove}>
                      {labels.agentApproveLabel}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={reviewPending}
                      onClick={onReject}
                    >
                      {labels.agentRejectLabel}
                    </Button>
                  </>
                )}
              </div>
            </div>
          ) : chatReply ? (
            <p className="editor-agent-continue-hint">{labels.agentContinueHint}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
