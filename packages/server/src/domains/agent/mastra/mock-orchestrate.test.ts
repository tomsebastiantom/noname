import { afterEach, describe, expect, it, vi } from "vitest";
import type { MastraExecutorDeps } from "./executor";
import { runMockOrchestrate } from "./mock-orchestrate";
import { parseOrchestrateOutput } from "./orchestrate-output";

function mockDeps(): MastraExecutorDeps {
  return {
    secrets: { resolveLlmApiKey: vi.fn(async () => null) },
    authorization: {
      check: vi.fn(async () => true),
      grant: vi.fn(),
      revoke: vi.fn(),
      listDirectUserEditors: vi.fn(async () => []),
      listDirectUserPublishers: vi.fn(async () => []),
      listRelationTuples: vi.fn(async () => []),
    },
    documents: {
      findDocumentById: vi.fn(async () => null),
      findCollectionIdBySlug: vi.fn(async () => null),
      findCollectionSlug: vi.fn(async () => null),
      listDocuments: vi.fn(async () => []),
    },
    analytics: {
      query: vi.fn(async () => [{ eventType: "page_view" }]),
      aggregate: vi.fn(async () => [{ key: "page_view", count: 1 }]),
    },
    integrations: { triggerOAuthAction: vi.fn() },
    aiPipeline: {
      generateLayout: vi.fn(async () => ({
        id: "g1",
        orgId: "org-1",
        prompt: "p",
        response: { type: "container", children: [] },
        model: "mock",
        tokens: 3,
        createdAt: new Date(),
      })),
      generateContent: vi.fn(async () => ({
        id: "g2",
        orgId: "org-1",
        prompt: "p",
        response: { title: "Draft" },
        model: "mock",
        tokens: 2,
        createdAt: new Date(),
      })),
      generateMachine: vi.fn(async () => ({
        id: "g3",
        orgId: "org-1",
        prompt: "p",
        response: {
          name: "flow",
          initial: "idle",
          states: { idle: { on: { go: { target: "done" } } }, done: { final: true } },
        },
        model: "mock",
        tokens: 2,
        createdAt: new Date(),
      })),
    },
    layout: {
      create: vi.fn(async () => ({
        id: "layout-1",
        key: "orchestrate-hero",
        status: "draft",
      })),
    },
    content: {
      create: vi.fn(async () => ({
        id: "content-1",
        type: "page",
        status: "draft",
      })),
    },
    machines: {
      define: vi.fn(async (_orgId, def) => def),
    },
  };
}

describe("runMockOrchestrate", () => {
  afterEach(() => {
    delete process.env.MASTRA_ORCHESTRATE_MOCK;
  });

  it("runs analytics, layout, and content tools without Mastra planner", async () => {
    const deps = mockDeps();
    const result = await runMockOrchestrate(
      deps,
      "org-1",
      "Summarize events and draft hero layout",
      {
        taskId: "task-1",
        registeredAgentId: "agent-1",
        onBehalfOf: "user-1",
      },
      ["readAnalytics", "generateLayoutDraft", "generateContentDraft"],
    );

    const output = parseOrchestrateOutput(result.output);
    expect(output).not.toBeNull();
    expect(output!.steps.length).toBeGreaterThanOrEqual(3);
    expect(output!.artifacts.length).toBeGreaterThanOrEqual(1);
    expect(result.model).toBe("mock-orchestrate");
    expect(deps.layout.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        audit: expect.objectContaining({
          actorType: "agent",
          taskId: "task-1",
        }),
      }),
    );
  });
});
