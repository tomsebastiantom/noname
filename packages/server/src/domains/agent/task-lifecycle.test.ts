import { describe, expect, it, vi } from "vitest";
import { eventBus } from "../../shared/event-bus";
import { AgentTask } from "./entity";
import type { AgentTaskDTO, AgentTaskStorage } from "./ports";
import { persistAgentTask } from "./task-lifecycle";

function taskRow(overrides: Partial<AgentTaskDTO> = {}): AgentTaskDTO {
  return {
    id: "task-1",
    orgId: "org-1",
    type: "generate_content",
    status: "pending",
    prompt: "Write copy",
    input: {},
    output: null,
    error: null,
    model: null,
    tokens: null,
    registeredAgentId: null,
    createdBy: null,
    approvedBy: null,
    rejectedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("persistAgentTask", () => {
  it("updates storage and publishes domain events", async () => {
    const update = vi.fn(async () => taskRow({ status: "running" }));
    const storage = { update } as unknown as AgentTaskStorage;
    const publish = vi.spyOn(eventBus, "publish").mockResolvedValue(undefined);

    const entity = AgentTask.fromDTO(taskRow());
    entity.start();
    await persistAgentTask(storage, "org-1", entity);

    expect(update).toHaveBeenCalledWith("org-1", "task-1", {
      status: "running",
      output: null,
      error: null,
      model: null,
      tokens: null,
    });
    expect(publish).toHaveBeenCalledWith("task.started", {
      taskId: "task-1",
      orgId: "org-1",
    });

    publish.mockRestore();
  });
});
