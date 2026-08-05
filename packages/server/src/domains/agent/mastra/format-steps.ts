import type { LLMStepResult } from "@mastra/core/agent";
import type { AgentStepRecord, OrchestrateOutput } from "./types";

function summarizeValue(value: unknown, max = 160): string | undefined {
  if (value == null) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

type LooseToolResult = {
  toolName?: string;
  args?: unknown;
  result?: unknown;
  error?: unknown;
  payload?: {
    toolName?: string;
    args?: unknown;
    result?: unknown;
    error?: unknown;
  };
};

function normalizeToolResult(raw: LooseToolResult) {
  const payload = raw.payload;
  return {
    toolName: raw.toolName ?? payload?.toolName ?? "unknown",
    args: raw.args ?? payload?.args,
    result: raw.result ?? payload?.result,
    error: raw.error ?? payload?.error,
  };
}

export function mapMastraSteps(steps: LLMStepResult[]): AgentStepRecord[] {
  const records: AgentStepRecord[] = [];

  for (const [index, step] of steps.entries()) {
    const toolResults = (step.toolResults ?? []) as LooseToolResult[];
    if (toolResults.length === 0) {
      records.push({
        index,
        tool: "planner",
        status: "ok",
        startedAt: new Date().toISOString(),
        durationMs: 0,
        outputSummary: summarizeValue(step.text),
      });
      continue;
    }

    for (const [toolIndex, raw] of toolResults.entries()) {
      const toolResult = normalizeToolResult(raw);
      records.push({
        index: index * 100 + toolIndex,
        tool: toolResult.toolName,
        status: toolResult.error ? "error" : "ok",
        startedAt: new Date().toISOString(),
        durationMs: 0,
        inputSummary: summarizeValue(toolResult.args),
        outputSummary: summarizeValue(toolResult.result ?? toolResult.error),
      });
    }
  }

  return records;
}

export function stoppedReasonFromFinish(
  finishReason: string | undefined,
): OrchestrateOutput["stoppedReason"] {
  if (finishReason === "tool-calls" || finishReason === "stop") return "completed";
  if (finishReason === "length") return "max_steps";
  return "completed";
}
