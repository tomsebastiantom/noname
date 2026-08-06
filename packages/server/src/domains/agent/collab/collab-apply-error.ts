export function formatCollabApplyError(err: unknown): string {
  const message = err instanceof Error ? err.message.trim() : String(err).trim();
  if (message === "Assertion failed" || message.includes("Assertion failed")) {
    return "Layout collab apply failed: the live document changed while the agent was working. Retry the task after the page syncs.";
  }
  if (message) return `Layout collab apply failed: ${message}`;
  return "Layout collab apply failed";
}
