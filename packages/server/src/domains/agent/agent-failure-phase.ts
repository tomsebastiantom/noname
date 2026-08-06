export function inferAgentFailurePhase(
  output: Record<string, unknown> | null,
  rawError: string,
): string {
  const message = rawError.toLowerCase();
  if (message.includes("assertion failed")) {
    if (/collab|automerge|layout/.test(message)) {
      return "layout collab apply";
    }
    return "orchestrator run";
  }
  if (message.includes("collab join") || message.includes("layout collab session")) {
    return "layout collab join";
  }
  if (message.includes("orchestrate agent tasks are disabled")) {
    return "orchestrator disabled";
  }
  if (/api key|401|403|authentication|openai|litellm/.test(message)) {
    return "LLM planner";
  }

  const steps = Array.isArray(output?.steps) ? output.steps : [];
  const last = steps[steps.length - 1] as { tool?: string; status?: string } | undefined;
  if (last?.tool) {
    return last.status === "error" ? `${last.tool} (error)` : `${last.tool} (in progress)`;
  }

  return "orchestrator run";
}
