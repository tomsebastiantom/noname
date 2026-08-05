import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMastraExecutor } from "./executor";
import { parseOrchestrateOutput } from "./orchestrate-output";

const generateMock = vi.fn();

vi.mock("@mastra/core/agent", () => ({
  Agent: class {
    generate = generateMock;
  },
}));

describe("createMastraExecutor", () => {
  beforeEach(() => {
    generateMock.mockReset();
    process.env.AGENT_ORCHESTRATE_ENABLED = "true";
  });

  it("returns structured orchestrate output with step timeline and artifacts", async () => {
    generateMock.mockResolvedValue({
      text: "Review the checkout hero draft.",
      finishReason: "stop",
      usage: { totalTokens: 42 },
      steps: [
        {
          toolResults: [
            {
              toolName: "readAnalytics",
              args: { limit: 5 },
              result: { eventCount: 2 },
            },
            {
              toolName: "generateLayoutDraft",
              args: { templateName: "checkout-hero" },
              result: { layoutId: "layout-1" },
            },
          ],
        },
      ],
    });

    const layoutCreate = vi.fn(async () => ({
      id: "layout-1",
      key: "checkout-hero",
      status: "draft",
    }));

    const executor = createMastraExecutor({
      secrets: {
        resolveLlmApiKey: vi.fn(async () => null),
      },
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
        query: vi.fn(async () => []),
        aggregate: vi.fn(async () => []),
      },
      integrations: {
        triggerOAuthAction: vi.fn(async () => ({ ok: true })),
      },
      aiPipeline: {
        generateLayout: vi.fn(async () => ({
          id: "gen-1",
          orgId: "org-1",
          prompt: "hero",
          response: { type: "container", children: [] },
          model: "mock",
          tokens: 10,
          createdAt: new Date(),
        })),
        generateContent: vi.fn(),
        generateMachine: vi.fn(),
      },
      layout: { create: layoutCreate },
      content: { create: vi.fn(), updateById: vi.fn() },
      machines: { define: vi.fn() },
    });

    const result = await executor.execute("org-1", "orchestrate", "Improve checkout", {
      taskId: "task-1",
      registeredAgentId: "agent-1",
      agentSlug: "demo",
      onBehalfOf: "user-1",
    });

    const output = parseOrchestrateOutput(result.output);
    expect(output).not.toBeNull();
    expect(output!.summary).toContain("checkout hero");
    expect(output!.steps.length).toBeGreaterThanOrEqual(2);
    expect(output!.stoppedReason).toBe("completed");
    expect(result.tokens).toBeGreaterThanOrEqual(42);
    expect(generateMock).toHaveBeenCalledWith(
      "Improve checkout",
      expect.objectContaining({
        maxSteps: expect.any(Number),
        activeTools: expect.arrayContaining(["readAnalytics", "generateLayoutDraft"]),
      }),
    );
  });

  it("rejects non-orchestrate task types", async () => {
    const executor = createMastraExecutor({
      secrets: {
        resolveLlmApiKey: vi.fn(async () => null),
      },
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
      analytics: { query: vi.fn(), aggregate: vi.fn() },
      integrations: { triggerOAuthAction: vi.fn() },
      aiPipeline: {
        generateLayout: vi.fn(),
        generateContent: vi.fn(),
        generateMachine: vi.fn(),
      },
      layout: { create: vi.fn() },
      content: { create: vi.fn(), updateById: vi.fn() },
      machines: { define: vi.fn() },
    });

    await expect(
      executor.execute("org-1", "generate_layout", "prompt", { taskId: "task-1" }),
    ).rejects.toThrow(/orchestrate/);
  });
});
