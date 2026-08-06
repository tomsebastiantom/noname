import { shortTaskId } from "../../agent/agent-task-diagnostics";
import type { EditorShellLabels } from "../../schemas/components";

export function AgentFailureDetails({
  taskId,
  phase,
  executor,
  queue,
  model,
  traceUrl,
  rawError,
  labels,
}: Readonly<{
  taskId: string;
  phase?: string;
  executor?: string;
  queue?: string;
  model?: string | null;
  traceUrl?: string | null;
  rawError?: string;
  labels: EditorShellLabels;
}>) {
  return (
    <div className="editor-agent-failure-details">
      <p className="editor-agent-failure-details-title">{labels.agentFailureDetailsLabel}</p>
      <dl className="editor-agent-failure-details-list">
        <div>
          <dt>Task</dt>
          <dd>{shortTaskId(taskId)}</dd>
        </div>
        {phase ? (
          <div>
            <dt>Failed during</dt>
            <dd>{phase}</dd>
          </div>
        ) : null}
        {queue ? (
          <div>
            <dt>Queue</dt>
            <dd>{queue}</dd>
          </div>
        ) : null}
        {executor ? (
          <div>
            <dt>Executor</dt>
            <dd>{executor}</dd>
          </div>
        ) : null}
        {model ? (
          <div>
            <dt>Model</dt>
            <dd>{model}</dd>
          </div>
        ) : null}
        {traceUrl ? (
          <div>
            <dt>Trace</dt>
            <dd>
              <a href={traceUrl} target="_blank" rel="noreferrer">
                Open in Jaeger
              </a>
            </dd>
          </div>
        ) : null}
      </dl>
      {rawError ? (
        <details className="editor-agent-failure-raw">
          <summary>Technical error</summary>
          <pre>{rawError}</pre>
        </details>
      ) : null}
    </div>
  );
}
