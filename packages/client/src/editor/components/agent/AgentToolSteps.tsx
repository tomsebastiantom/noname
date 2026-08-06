import type { AgentStepRecord } from "../../../auth/agents";
import type { EditorShellLabels } from "../../schemas/components";

function stepStatusClass(status: AgentStepRecord["status"]): string {
  if (status === "error") return "editor-agent-step--error";
  if (status === "denied") return "editor-agent-step--denied";
  return "editor-agent-step--ok";
}

function stepStatusIcon(status: AgentStepRecord["status"]): string {
  if (status === "error") return "×";
  if (status === "denied") return "!";
  return "✓";
}

export function AgentToolSteps({
  steps,
  labels,
}: Readonly<{
  steps: AgentStepRecord[];
  labels: EditorShellLabels;
  /** @deprecated kept so older call sites type-check */
  running?: boolean;
  defaultOpen?: boolean;
}>) {
  if (steps.length === 0) return null;

  const summary = steps.map((step) => step.tool).join(" · ");

  return (
    <details className="editor-agent-tool-steps">
      <summary className="editor-agent-tool-steps-toggle">
        <span className="editor-agent-tool-steps-chevron" aria-hidden>
          ›
        </span>
        <span className="editor-agent-tool-steps-toggle-label">{labels.agentStepsLabel}</span>
        <span className="editor-agent-tool-steps-count">{steps.length}</span>
        <span className="editor-agent-tool-steps-summary">{summary}</span>
      </summary>
      <ul className="editor-agent-tool-steps-list">
        {steps.map((step) => (
          <li key={`${step.tool}-${step.index}`} className="editor-agent-tool-steps-item">
            <span
              className={`editor-agent-step-status ${stepStatusClass(step.status)}`}
              aria-hidden
            >
              {stepStatusIcon(step.status)}
            </span>
            <div className="editor-agent-tool-steps-item-body">
              <span className={`editor-agent-step-badge ${stepStatusClass(step.status)}`}>
                {step.tool}
              </span>
              {step.outputSummary ? (
                <span className="editor-agent-tool-feed-detail">{step.outputSummary}</span>
              ) : (
                <span className="editor-agent-tool-feed-detail editor-agent-tool-feed-detail--muted">
                  {step.status} · {step.durationMs}ms
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
