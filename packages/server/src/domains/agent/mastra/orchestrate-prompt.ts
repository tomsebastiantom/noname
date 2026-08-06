export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

const MAX_HISTORY_TURNS = 24;
const MAX_TURN_CHARS = 2_000;

function trimTurn(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= MAX_TURN_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_TURN_CHARS)}…`;
}

export function parseConversationHistory(input: Record<string, unknown>): ConversationTurn[] {
  const raw = input.conversationHistory;
  if (!Array.isArray(raw)) return [];

  const turns: ConversationTurn[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    const role = record.role;
    const content = record.content;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof content !== "string" || !content.trim()) continue;
    turns.push({ role, content: trimTurn(content) });
  }

  return turns.slice(-MAX_HISTORY_TURNS);
}

/** Mastra gets one user string per task — prepend prior turns so "yes" retains context. */
export function buildOrchestrateUserPrompt(prompt: string, history: ConversationTurn[]): string {
  const latest = prompt.trim();
  if (history.length === 0) return latest;

  const transcript = history
    .map((turn) => `${turn.role === "user" ? "Human" : "Assistant"}: ${turn.content}`)
    .join("\n");

  return `Previous conversation on this page:\n${transcript}\n\nLatest message:\n${latest}`;
}
