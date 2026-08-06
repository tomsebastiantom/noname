import { describe, expect, it } from "vitest";
import type { AgentTask } from "../../auth/agents";
import { filterAgentTasksSince } from "./agent-thread-from-tasks";

function task(id: string, createdAt: string): AgentTask {
  return {
    id,
    orgId: "org",
    type: "orchestrate",
    prompt: id,
    status: "completed",
    input: {},
    output: null,
    error: null,
    model: null,
    tokens: 0,
    registeredAgentId: null,
    createdBy: null,
    approvedBy: null,
    rejectedBy: null,
    createdAt,
    updatedAt: createdAt,
  };
}

describe("filterAgentTasksSince", () => {
  it("returns all tasks when clearedAt is missing", () => {
    const tasks = [task("a", "2026-08-06T12:00:00.000Z"), task("b", "2026-08-06T13:00:00.000Z")];
    expect(filterAgentTasksSince(tasks, null)).toHaveLength(2);
  });

  it("hides tasks at or before clearedAt", () => {
    const tasks = [
      task("old", "2026-08-06T12:00:00.000Z"),
      task("new", "2026-08-06T14:00:00.000Z"),
    ];
    expect(filterAgentTasksSince(tasks, "2026-08-06T13:00:00.000Z").map((row) => row.id)).toEqual([
      "new",
    ]);
  });
});
