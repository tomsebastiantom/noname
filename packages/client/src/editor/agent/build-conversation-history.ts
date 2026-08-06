import type { AgentTask } from "../../auth/agents";
import { parseOrchestrateOutput } from "../../auth/agents";
import type { AgentThreadEntry } from "./agent-thread-from-tasks";

export type ConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

const MAX_TURNS = 24;

export function buildConversationHistory(
  thread: AgentThreadEntry[],
  tasksById: Record<string, AgentTask>,
): ConversationTurn[] {
  const turns: ConversationTurn[] = [];

  for (const entry of thread) {
    const task = tasksById[entry.taskId];
    if (!task || task.status === "pending" || task.status === "running") {
      continue;
    }

    turns.push({ role: "user", content: entry.content.trim() });

    const summary = parseOrchestrateOutput(task.output)?.summary?.trim();
    if (summary) {
      turns.push({ role: "assistant", content: summary });
      continue;
    }
    if (task.error?.trim()) {
      turns.push({ role: "assistant", content: task.error.trim() });
    }
  }

  return turns.slice(-MAX_TURNS);
}
