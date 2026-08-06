export function humanizeAgentTaskError(raw: string): string {
  const message = raw.trim();
  if (!message) return "The agent task failed. Try again or refresh the page.";

  if (message.includes("Assertion failed")) {
    if (/collab|automerge|layout/i.test(message)) {
      return "The layout could not be updated safely while live collaboration was active. Refresh the page, then ask the agent to try again.";
    }
    return "Live collaboration hit a sync conflict while the agent was working. Refresh the page, then try again.";
  }

  if (/layout collab apply failed/i.test(message)) {
    return message;
  }

  if (/layout collab session not connected/i.test(message)) {
    return "The agent lost its connection to the live page. Refresh and run the task again.";
  }

  if (/orchestrate agent tasks are disabled/i.test(message)) {
    return "Agent orchestration is disabled on this server.";
  }

  if (/api key|401|403|authentication/i.test(message)) {
    return "The agent could not reach the language model. Check API credentials and try again.";
  }

  return message;
}

export function humanizeAgentTaskErrorFromUnknown(err: unknown): string {
  if (err instanceof Error) return humanizeAgentTaskError(err.message);
  return humanizeAgentTaskError(String(err));
}
