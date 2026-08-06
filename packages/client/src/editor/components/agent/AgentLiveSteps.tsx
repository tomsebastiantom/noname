import type { AgentStepRecord } from "../../../auth/agents";

function stepStatusClass(status: AgentStepRecord["status"]): string {
  if (status === "error") return "editor-agent-step--error";
  if (status === "denied") return "editor-agent-step--denied";
  return "editor-agent-step--ok";
}

function StepSpinner() {
  return <span className="editor-agent-step-spinner" aria-hidden />;
}

export function AgentLiveSteps({
  steps,
  running,
}: Readonly<{
  steps: AgentStepRecord[];
  running: boolean;
}>) {
  if (steps.length === 0) return null;

  return (
    <ul className="editor-agent-live-steps" aria-live="polite">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const inFlight = running && isLast && step.status === "ok" && !step.outputSummary;
        return (
          <li key={`${step.tool}-${step.index}`} className="editor-agent-live-steps-item">
            {inFlight ? (
              <StepSpinner />
            ) : (
              <span
                className={`editor-agent-live-steps-icon ${stepStatusClass(step.status)}`}
                aria-hidden
              >
                {step.status === "error" ? "×" : step.status === "denied" ? "!" : "✓"}
              </span>
            )}
            <div className="editor-agent-live-steps-body">
              <span className="editor-agent-live-steps-tool">{step.tool}</span>
              {step.outputSummary ? (
                <span className="editor-agent-live-steps-detail">{step.outputSummary}</span>
              ) : inFlight ? (
                <span className="editor-agent-live-steps-detail editor-agent-live-steps-detail--muted">
                  Running…
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
