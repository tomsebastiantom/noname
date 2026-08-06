export interface AgentStepRecord {
  index: number;
  tool: string;
  status: "ok" | "denied" | "error";
  startedAt: string;
  durationMs: number;
  inputSummary?: string;
  outputSummary?: string;
  documentIds?: string[];
}

export interface AgentArtifact {
  kind: "layout" | "content" | "insight" | "machine";
  documentId?: string;
  label: string;
  /** Pre-patch layout spec — used to undo on task reject. */
  revertSpec?: Record<string, unknown>;
  /** True when patch ran on the open editor (live canvas) — undo via reject, not approve gate. */
  liveEditorPatch?: boolean;
}

export interface OrchestrateOutput {
  summary: string;
  steps: AgentStepRecord[];
  artifacts: AgentArtifact[];
  stoppedReason: "completed" | "max_steps" | "error" | "denied";
}
