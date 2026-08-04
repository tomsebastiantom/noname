import { describe, expect, it, vi } from "vitest";
import type { AgentTaskDTO, AgentTaskStorage } from "./ports";
import { createAgentService } from "./service";

function taskRow(overrides: Partial<AgentTaskDTO> = {}): AgentTaskDTO {
  return {
    id: "task-1",
    orgId: "org-1",
    type: "generate_content",
    status: "completed",
    prompt: "Write copy",
    input: {},
    output: { title: "Hello" },
    error: null,
    model: "gpt-test",
    tokens: 42,
    registeredAgentId: "agent-row-1",
    createdBy: {
      actorType: "human",
      actorId: "user-creator",
      onBehalfOf: null,
      at: new Date("2026-08-01T12:00:00Z"),
    },
    approvedBy: null,
    rejectedBy: null,
    createdAt: new Date("2026-08-01T12:00:00Z"),
    updatedAt: new Date("2026-08-01T12:05:00Z"),
    ...overrides,
  };
}

describe("createAgentService audit", () => {
  it("persists approvedBy when a human approves a completed task", async () => {
    const update = vi.fn(async (_orgId, _id, patch) =>
      taskRow({ status: "approved", approvedBy: patch.approvedBy ?? null }),
    );
    const storage = {
      findById: vi.fn(async () => taskRow()),
      update,
    } as unknown as AgentTaskStorage;

    const service = createAgentService(storage);
    const saved = await service.approve("org-1", "task-1", {
      actorType: "human",
      actorId: "user-reviewer",
    });

    expect(update).toHaveBeenCalledWith(
      "org-1",
      "task-1",
      expect.objectContaining({
        status: "approved",
        approvedBy: expect.objectContaining({
          actorType: "human",
          actorId: "user-reviewer",
        }),
        rejectedBy: null,
      }),
    );
    expect(saved.status).toBe("approved");
    expect(saved.approvedBy?.actorId).toBe("user-reviewer");
  });
});
