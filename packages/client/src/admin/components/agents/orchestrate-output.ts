import type { AgentArtifact, AgentStepRecord, OrchestrateOutput } from "../../../auth/agents";
import type { AgentsAdminLabels } from "./agents-admin-labels";

export function parseOrchestrateOutput(
  output: Record<string, unknown> | null,
): OrchestrateOutput | null {
  if (!output || typeof output !== "object") return null;
  const summary = typeof output.summary === "string" ? output.summary : "";
  const steps = Array.isArray(output.steps) ? (output.steps as AgentStepRecord[]) : [];
  const artifacts = Array.isArray(output.artifacts) ? (output.artifacts as AgentArtifact[]) : [];
  const stoppedReason =
    output.stoppedReason === "max_steps" ||
    output.stoppedReason === "error" ||
    output.stoppedReason === "denied"
      ? output.stoppedReason
      : "completed";
  if (!summary && steps.length === 0 && artifacts.length === 0) return null;
  return { summary, steps, artifacts, stoppedReason };
}

export function artifactHref(artifact: AgentArtifact): string | null {
  if (artifact.kind === "layout") return `/admin/layout/${encodeURIComponent(artifact.label)}`;
  if (artifact.kind === "content") return `/admin/content/${encodeURIComponent(artifact.label)}`;
  return null;
}

export function stepStatusLabel(
  status: AgentStepRecord["status"],
  labels: AgentsAdminLabels,
): string {
  if (status === "denied") return labels.stepStatusDeniedLabel;
  if (status === "error") return labels.stepStatusErrorLabel;
  return labels.stepStatusOkLabel;
}
