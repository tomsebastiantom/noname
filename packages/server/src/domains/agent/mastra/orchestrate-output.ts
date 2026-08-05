import { z } from "zod";
import type { AgentArtifact, AgentStepRecord, OrchestrateOutput } from "./types";

const agentStepRecordSchema = z.object({
  index: z.number().int().nonnegative(),
  tool: z.string().min(1),
  status: z.enum(["ok", "denied", "error"]),
  startedAt: z.string().min(1),
  durationMs: z.number().nonnegative(),
  inputSummary: z.string().optional(),
  outputSummary: z.string().optional(),
  documentIds: z.array(z.string()).optional(),
});

const agentArtifactSchema = z.object({
  kind: z.enum(["layout", "content", "insight"]),
  documentId: z.string().optional(),
  label: z.string().min(1),
});

export const orchestrateOutputSchema = z.object({
  summary: z.string(),
  steps: z.array(agentStepRecordSchema),
  artifacts: z.array(agentArtifactSchema),
  stoppedReason: z.enum(["completed", "max_steps", "error", "denied"]),
});

export function parseOrchestrateOutput(value: unknown): OrchestrateOutput | null {
  const parsed = orchestrateOutputSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function assertOrchestrateOutput(value: unknown): OrchestrateOutput {
  return orchestrateOutputSchema.parse(value) as OrchestrateOutput;
}

export function emptyOrchestrateOutput(
  summary: string,
  stoppedReason: OrchestrateOutput["stoppedReason"] = "error",
): OrchestrateOutput {
  return {
    summary,
    steps: [] as AgentStepRecord[],
    artifacts: [] as AgentArtifact[],
    stoppedReason,
  };
}
