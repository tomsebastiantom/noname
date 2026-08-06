import { type KeyboardEvent, useRef } from "react";
import type { AgentTask } from "../../../auth/agents";
import { buildAgentPromptPlaceholder } from "../../agent/build-prompt-prefill";
import type { EditorShellLabels } from "../../schemas/components";
import { AgentAssistantBubble } from "./AgentAssistantBubble";
import { AgentChatAvatar, AgentChatSparkleIcon } from "./AgentChatAvatar";
import { AgentSendIcon } from "./AgentSendIcon";
import { AgentUserMessage } from "./AgentUserMessage";

import "./agent-panel.css";

const PROMPT_MAX_HEIGHT_PX = 112;

function resizePrompt(textarea: HTMLTextAreaElement | null) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, PROMPT_MAX_HEIGHT_PX)}px`;
}

export function AgentPanel({
  labels,
  agents,
  loadingAgents,
  loadingThread,
  agentId,
  onAgentIdChange,
  prompt,
  onPromptChange,
  submitting,
  error,
  thread,
  tasksById,
  layoutDocumentId,
  onSubmit,
  onApprove,
  onReject,
  onUndo,
  onRetry,
  reviewPending,
  threadScrollRef,
  threadEndRef,
  onClearChat,
  canClearChat,
  templateName,
  selectedComponentType,
  richTextTarget,
  canSubmit,
  collabConnected = false,
  collabError = null,
  agentInPresence = false,
  agentTaskRunning = false,
}: Readonly<{
  labels: EditorShellLabels;
  agents: Array<{ id: string; label: string; slug: string }>;
  loadingAgents: boolean;
  loadingThread?: boolean;
  agentId: string;
  onAgentIdChange: (value: string) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  submitting: boolean;
  error: string | null;
  thread: Array<{ id: string; role: "user"; content: string; taskId: string }>;
  tasksById: Record<string, AgentTask>;
  layoutDocumentId: string | null;
  onSubmit: () => void | Promise<void>;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
  onUndo: (taskId: string) => void;
  onRetry?: (taskId: string) => void;
  reviewPending: boolean;
  threadScrollRef: React.RefObject<HTMLDivElement | null>;
  threadEndRef: React.RefObject<HTMLDivElement | null>;
  onClearChat: () => void;
  canClearChat: boolean;
  templateName: string;
  selectedComponentType: string | null;
  richTextTarget: { fieldLabel: string } | null;
  canSubmit: boolean;
  collabConnected?: boolean;
  collabError?: string | null;
  agentInPresence?: boolean;
  agentTaskRunning?: boolean;
}>) {
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const selectedAgent = agents.find((agent) => agent.id === agentId);
  const promptPlaceholder = buildAgentPromptPlaceholder({
    defaultPlaceholder: labels.runAgentPromptPlaceholder,
    templateName,
    componentType: selectedComponentType,
    richTextTarget,
    agentLabel: selectedAgent?.label || selectedAgent?.slug || null,
  });
  const assistantContext = [
    templateName ? templateName : null,
    selectedComponentType ? selectedComponentType : null,
    richTextTarget?.fieldLabel ?? null,
  ].filter(Boolean);

  const liveStatusText = (() => {
    if (!collabConnected) {
      return collabError
        ? `Canvas offline — ${collabError}`
        : "Canvas offline — refresh the page to reconnect live editing.";
    }
    if (agentTaskRunning && !agentInPresence) {
      return `${selectedAgent?.label || "Agent"} is working — connecting to live collab…`;
    }
    if (agentTaskRunning && agentInPresence) {
      return `${selectedAgent?.label || "Agent"} is connected and editing live on the canvas.`;
    }
    if (agentInPresence) {
      return "Agent is connected on the canvas.";
    }
    return "Live canvas connected — ask the agent to start working.";
  })();

  const agentLabelForTask = (task: AgentTask): string => {
    if (task.registeredAgentId) {
      const match = agents.find((agent) => agent.id === task.registeredAgentId);
      if (match?.label) return match.label;
      if (match?.slug) return match.slug;
    }
    return selectedAgent?.label || selectedAgent?.slug || labels.collabAgentFallbackLabel;
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!submitting && canSubmit) onSubmit();
  };

  const threadBody = loadingThread ? (
    <p className="editor-agent-welcome-body">{labels.runAgentSubmittingLabel}</p>
  ) : thread.length === 0 ? (
    <div className="editor-agent-welcome">
      <AgentChatAvatar size="welcome" />
      <p className="editor-agent-welcome-title">{labels.agentPanelTitle}</p>
      <p className="editor-agent-welcome-body">
        {selectedAgent
          ? `${selectedAgent.label || selectedAgent.slug} works on this page in the canvas while you watch. Ask for a change below.`
          : labels.agentEmptyHint}
      </p>
      {assistantContext.length > 0 ? (
        <p className="editor-agent-welcome-context">
          {labels.agentContextLabel}: {assistantContext.join(" · ")}
        </p>
      ) : null}
    </div>
  ) : (
    thread.map((entry) => {
      const task = tasksById[entry.taskId];
      return (
        <div key={entry.id} className="editor-agent-thread-entry">
          <AgentUserMessage content={entry.content} selfLabel={labels.collabSelfLabel} />
          {task ? (
            <AgentAssistantBubble
              task={task}
              agentLabel={agentLabelForTask(task)}
              labels={labels}
              layoutDocumentId={layoutDocumentId}
              onApprove={() => onApprove(task.id)}
              onReject={() => onReject(task.id)}
              onUndo={() => onUndo(task.id)}
              onRetry={onRetry ? () => onRetry(task.id) : undefined}
              reviewPending={reviewPending}
              retryPending={submitting}
            />
          ) : null}
        </div>
      );
    })
  );

  return (
    <div className="editor-agent-panel">
      <div className="editor-agent-panel-toolbar">
        <div className="editor-agent-panel-toolbar-row">
          <span className="editor-agent-toolbar-mark" aria-hidden>
            <AgentChatSparkleIcon className="editor-agent-toolbar-icon" />
          </span>
          <select
            id="editor-agent-select"
            className="editor-agent-select"
            value={agentId}
            disabled={loadingAgents}
            aria-label={labels.runAgentSelectLabel}
            onChange={(event) => onAgentIdChange(event.target.value)}
          >
            <option value="">{labels.runAgentSelectPlaceholder}</option>
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.label || agent.slug}
              </option>
            ))}
          </select>
          {thread.length > 0 ? (
            <button
              type="button"
              className="editor-agent-clear-chat"
              disabled={!canClearChat}
              title={!canClearChat ? labels.agentClearChatDisabledHint : undefined}
              onClick={onClearChat}
            >
              {labels.agentClearChatLabel}
            </button>
          ) : null}
        </div>
        <p
          className={`editor-agent-live-status${collabConnected ? " editor-agent-live-status--ok" : ""}${agentTaskRunning ? " editor-agent-live-status--running" : ""}`}
          role="status"
        >
          {liveStatusText}
        </p>
      </div>

      <div className="editor-agent-thread-wrap">
        <div ref={threadScrollRef} className="editor-agent-thread editor-sidebar-scroll">
          {threadBody}
          <div ref={threadEndRef} />
        </div>
        <div className="editor-agent-thread-fade" aria-hidden />
      </div>

      <div className="editor-agent-composer">
        {error ? <p className="editor-agent-error">{error}</p> : null}
        <div className="editor-agent-composer-box">
          <textarea
            ref={promptRef}
            id="editor-agent-prompt"
            rows={1}
            className="editor-agent-prompt"
            value={prompt}
            placeholder={promptPlaceholder}
            aria-label={labels.runAgentPromptLabel}
            onKeyDown={handleComposerKeyDown}
            onChange={(event) => {
              onPromptChange(event.target.value);
              resizePrompt(event.currentTarget);
            }}
          />
          <button
            type="button"
            className="editor-agent-send-icon"
            disabled={submitting || !canSubmit}
            aria-label={submitting ? labels.runAgentSubmittingLabel : labels.runAgentSubmitLabel}
            onClick={() => onSubmit()}
          >
            <AgentSendIcon className="editor-agent-send-icon-svg" />
          </button>
        </div>
        <p className="editor-agent-composer-hint">
          {selectedAgent
            ? `${selectedAgent.label || selectedAgent.slug} · ${labels.agentContinueHint}`
            : labels.runAgentSelectPlaceholder}
        </p>
      </div>
    </div>
  );
}
