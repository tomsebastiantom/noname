import { describe, expect, it } from "vitest";
import type { AgentTask } from "../../auth/agents";
import { buildConversationHistory } from "./build-conversation-history";

function task(id: string, status: AgentTask["status"], summary: string | null): AgentTask {
  return {
    id,
    orgId: "org",
    type: "orchestrate",
    prompt: id,
    status,
    input: {},
    output: summary ? { summary, steps: [], artifacts: [], stoppedReason: "completed" } : null,
    error: null,
    model: null,
    tokens: 0,
    registeredAgentId: null,
    createdBy: null,
    approvedBy: null,
    rejectedBy: null,
    createdAt: "2026-08-06T12:00:00.000Z",
    updatedAt: "2026-08-06T12:00:00.000Z",
  };
}

describe("buildConversationHistory", () => {
  it("pairs user prompts with assistant summaries", () => {
    const thread = [
      { id: "t1", role: "user" as const, content: "Edit summer sale", taskId: "t1", at: "" },
      { id: "t2", role: "user" as const, content: "yes", taskId: "t2", at: "" },
    ];
    const tasksById = {
      t1: task("t1", "completed", "Update the home hero Text block?"),
      t2: task("t2", "running", null),
    };

    expect(buildConversationHistory(thread, tasksById)).toEqual([
      { role: "user", content: "Edit summer sale" },
      { role: "assistant", content: "Update the home hero Text block?" },
    ]);
  });
});
