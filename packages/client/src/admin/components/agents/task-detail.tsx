import type { useActions } from "@json-render/react";
import type { AgentTask, OrchestrateOutput } from "../../../auth/agents";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import type { AgentsAdminLabels } from "./agents-admin-labels";
import { artifactHref, stepStatusLabel } from "./orchestrate-output";

type TaskDetailProps = {
  labels: AgentsAdminLabels;
  selectedTaskDetail: AgentTask;
  orchestrateOutput: OrchestrateOutput | null;
  execute: ReturnType<typeof useActions>["execute"];
};

export function TaskDetail({
  labels,
  selectedTaskDetail,
  orchestrateOutput,
  execute,
}: TaskDetailProps) {
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">{selectedTaskDetail.type}</h3>
          <p className="text-sm text-muted-foreground">{selectedTaskDetail.prompt}</p>
        </div>
        <Badge>{selectedTaskDetail.status}</Badge>
      </div>

      {selectedTaskDetail.status === "pending" || selectedTaskDetail.status === "running" ? (
        <p className="text-sm text-muted-foreground">{labels.runningTaskLabel}</p>
      ) : null}

      {selectedTaskDetail.error ? (
        <Alert variant="destructive">
          <AlertDescription>{selectedTaskDetail.error}</AlertDescription>
        </Alert>
      ) : null}

      {orchestrateOutput ? (
        <>
          {orchestrateOutput.summary ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">{labels.runSummaryLabel}</p>
              <p className="text-sm text-muted-foreground">{orchestrateOutput.summary}</p>
            </div>
          ) : null}

          {orchestrateOutput.steps.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">{labels.stepsSectionTitle}</p>
              <ol className="space-y-2">
                {orchestrateOutput.steps.map((step) => (
                  <li
                    key={`${step.index}-${step.tool}`}
                    className="rounded-md border px-3 py-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs">{step.tool}</span>
                      <Badge variant="outline">{stepStatusLabel(step.status, labels)}</Badge>
                      <span className="text-xs text-muted-foreground">{step.durationMs}ms</span>
                    </div>
                    {step.outputSummary ? (
                      <p className="mt-1 text-xs text-muted-foreground">{step.outputSummary}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-sm font-medium">{labels.artifactsSectionTitle}</p>
            {orchestrateOutput.artifacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">{labels.noArtifactsMessage}</p>
            ) : (
              <ul className="space-y-1">
                {orchestrateOutput.artifacts.map((artifact) => {
                  const href = artifactHref(artifact);
                  return (
                    <li key={`${artifact.kind}-${artifact.documentId ?? artifact.label}`}>
                      {href ? (
                        <a
                          href={href}
                          className="text-sm text-primary underline-offset-4 hover:underline"
                        >
                          {artifact.kind}: {artifact.label}
                        </a>
                      ) : (
                        <span className="text-sm">
                          {artifact.kind}: {artifact.label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}

      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => void execute({ action: "selectAgentTask", params: { taskId: null } })}
      >
        Close
      </Button>
    </div>
  );
}
