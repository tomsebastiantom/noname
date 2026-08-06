export type AgentTaskDiagnostics = {
  phase?: string;
  rawError?: string;
  traceId?: string;
  executor?: string;
  queue?: string;
};

export function parseAgentTaskDiagnostics(
  output: Record<string, unknown> | null,
): AgentTaskDiagnostics | null {
  if (!output || typeof output !== "object") return null;
  const diagnostics = output.diagnostics;
  if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics)) {
    return null;
  }
  const record = diagnostics as Record<string, unknown>;
  return {
    phase: typeof record.phase === "string" ? record.phase : undefined,
    rawError: typeof record.rawError === "string" ? record.rawError : undefined,
    traceId: typeof record.traceId === "string" ? record.traceId : undefined,
    executor: typeof record.executor === "string" ? record.executor : undefined,
    queue: typeof record.queue === "string" ? record.queue : undefined,
  };
}

export function jaegerTraceUrl(traceId: string): string {
  return `http://localhost:16686/trace/${traceId}`;
}

export function shortTaskId(taskId: string): string {
  return taskId.length > 8 ? `${taskId.slice(0, 8)}…` : taskId;
}

export function inferFailurePhaseFromError(error: string | null | undefined): string | undefined {
  if (!error?.trim()) return undefined;
  const message = error.toLowerCase();
  if (message.includes("live collaboration") || /layout collab/i.test(message)) {
    return "layout collab apply (inferred)";
  }
  if (/api key|401|403|authentication|openai|litellm/i.test(message)) {
    return "LLM planner (inferred)";
  }
  if (message.includes("orchestrate agent tasks are disabled")) {
    return "orchestrator disabled (inferred)";
  }
  return "orchestrator run (inferred)";
}

export function resolveAgentTaskDiagnostics(task: {
  error?: string | null;
  output: Record<string, unknown> | null;
}): AgentTaskDiagnostics {
  const parsed = parseAgentTaskDiagnostics(task.output);
  const rawError = parsed?.rawError ?? task.error ?? undefined;
  return {
    phase: parsed?.phase ?? inferFailurePhaseFromError(rawError ?? task.error),
    rawError,
    traceId: parsed?.traceId,
    executor: parsed?.executor ?? (rawError || task.error ? "mastra (inferred)" : undefined),
    queue: parsed?.queue ?? (rawError || task.error ? "agent (inferred)" : undefined),
  };
}
