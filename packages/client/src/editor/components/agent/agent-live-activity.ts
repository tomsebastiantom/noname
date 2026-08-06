import type { AgentStepRecord, AgentTask, OrchestrateOutput } from "../../../auth/agents";
import type { EditorShellLabels } from "../../schemas/components";

export function agentLiveHeadline(
  task: AgentTask,
  orchestrate: OrchestrateOutput | null,
  labels: EditorShellLabels,
): string {
  const summary = orchestrate?.summary?.trim();
  if (summary) return summary;
  if (task.status === "pending") return labels.agentConsoleQueuedLabel;
  return labels.agentConsoleWorkingLabel;
}

export function agentLatestStep(orchestrate: OrchestrateOutput | null): AgentStepRecord | null {
  if (!orchestrate || orchestrate.steps.length === 0) return null;
  return orchestrate.steps[orchestrate.steps.length - 1] ?? null;
}

export function agentHasLiveProgress(orchestrate: OrchestrateOutput | null): boolean {
  if (!orchestrate) return false;
  return Boolean(orchestrate.summary?.trim()) || orchestrate.steps.length > 0;
}
