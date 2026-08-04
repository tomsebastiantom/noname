import { PERMISSIONS } from "@noname/auth";
import { describe, expect, it, vi } from "vitest";
import type { AgentRegistryStorage } from "./adapters/registry-postgres";
import type { AgentTaskDTO } from "./ports";
import { canReviewAgentTask } from "./task-review-guard";

function task(registeredAgentId: string | null): AgentTaskDTO {
  return {
    id: "task-1",
    orgId: "org-1",
    type: "generate_content",
    status: "completed",
    prompt: "x",
    input: {},
    output: {},
    error: null,
    model: null,
    tokens: null,
    registeredAgentId,
    createdBy: null,
    approvedBy: null,
    rejectedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("canReviewAgentTask", () => {
  it("allows store admin for any task", async () => {
    const registry = {} as AgentRegistryStorage;
    await expect(
      canReviewAgentTask(registry, "org-1", task(null), "user-1", [PERMISSIONS.AGENT_MANAGE]),
    ).resolves.toBe(true);
  });

  it("allows agent owner for linked tasks", async () => {
    const registry = {
      findById: vi.fn(async () => ({
        id: "agent-1",
        orgId: "org-1",
        slug: "bot",
        label: "Bot",
        ownerUserId: "owner-1",
        allowedTools: [],
        createdAt: new Date(),
      })),
    } as unknown as AgentRegistryStorage;

    await expect(
      canReviewAgentTask(registry, "org-1", task("agent-1"), "owner-1", []),
    ).resolves.toBe(true);
  });

  it("denies non-owner when task is linked to another agent", async () => {
    const registry = {
      findById: vi.fn(async () => ({
        id: "agent-1",
        orgId: "org-1",
        slug: "bot",
        label: "Bot",
        ownerUserId: "owner-1",
        allowedTools: [],
        createdAt: new Date(),
      })),
    } as unknown as AgentRegistryStorage;

    await expect(
      canReviewAgentTask(registry, "org-1", task("agent-1"), "other-user", []),
    ).resolves.toBe(false);
  });

  it("denies non-admin when task has no linked agent", async () => {
    const registry = {} as AgentRegistryStorage;
    await expect(
      canReviewAgentTask(registry, "org-1", task(null), "owner-1", []),
    ).resolves.toBe(false);
  });
});
