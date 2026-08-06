import { useMemo } from "react";
import { type AgentStepRecord, type AgentTask, parseOrchestrateOutput } from "../../../auth/agents";
import type { EditorShellLabels } from "../../schemas/components";

type ConsoleLine = {
  id: string;
  text: string;
  kind: "info" | "step" | "error" | "success";
  active?: boolean;
};

function stepLine(step: AgentStepRecord): ConsoleLine {
  const detail = step.outputSummary?.trim();
  const text = detail
    ? `${step.tool} — ${detail}`
    : `${step.tool} (${step.status}, ${step.durationMs}ms)`;
  return {
    id: `step-${step.index}-${step.tool}`,
    text,
    kind: step.status === "error" ? "error" : step.status === "denied" ? "error" : "step",
  };
}

function waitingLabel(task: AgentTask, labels: EditorShellLabels): string {
  if (task.status === "pending") return labels.agentConsoleQueuedLabel;
  return labels.agentConsoleWorkingLabel;
}

export function AgentActivityConsole({
  task,
  labels,
}: Readonly<{
  task: AgentTask;
  labels: EditorShellLabels;
}>) {
  const orchestrate = useMemo(() => parseOrchestrateOutput(task.output), [task.output]);
  const running = task.status === "pending" || task.status === "running";

  const lines = useMemo((): ConsoleLine[] => {
    if (task.error) {
      return [{ id: "error", text: task.error, kind: "error" }];
    }

    const rows: ConsoleLine[] = [];

    if (orchestrate && orchestrate.steps.length > 0) {
      rows.push(...orchestrate.steps.map(stepLine));
    }

    if (running) {
      const liveSummary = orchestrate?.summary?.trim();
      rows.push({
        id: "active",
        text: liveSummary || waitingLabel(task, labels),
        kind: "info",
        active: true,
      });
      return rows;
    }

    if (orchestrate?.summary?.trim()) {
      rows.push({ id: "summary", text: orchestrate.summary.trim(), kind: "success" });
    }

    if (task.status === "failed") {
      return [{ id: "failed", text: labels.agentStatusFailedLabel, kind: "error" }];
    }

    return rows;
  }, [task, orchestrate, running, labels]);

  if (lines.length === 0) return null;

  return (
    <div className="editor-agent-console" aria-live="polite">
      <div className="editor-agent-console-header">{labels.agentConsoleTitle}</div>
      <div className="editor-agent-console-body editor-sidebar-scroll">
        {lines.map((line) => (
          <div
            key={line.id}
            className={`editor-agent-console-line editor-agent-console-line--${line.kind}${
              line.active ? " editor-agent-console-line--active" : ""
            }`}
          >
            <span className="editor-agent-console-prefix" aria-hidden>
              ›
            </span>
            <span className="editor-agent-console-text">{line.text}</span>
            {line.active ? (
              <span className="editor-agent-console-cursor" aria-hidden>
                ▍
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
