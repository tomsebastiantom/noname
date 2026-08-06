import { describe, expect, it, vi } from "vitest";
import { documentRow } from "../../../documents/test-helpers";
import type { AgentRunContext } from "../context";
import { createPatchLayoutDraftTool } from "./patch-layout-draft";

const runContext: AgentRunContext = {
  orgId: "org-1",
  taskId: "task-1",
  registeredAgentId: "agent-1",
  agentSlug: "local-test-agent",
  agentLabel: "Local test agent",
  onBehalfOf: "user-1",
  targetLayoutDocumentId: "layout-1",
};

describe("createPatchLayoutDraftTool", () => {
  it("joins layout collab for presence after in-process spec apply", async () => {
    const previousSpec = {
      root: "intro",
      elements: { intro: { type: "Text", props: { labels: { content: "Before" } } } },
    };
    const nextSpec = {
      root: "intro",
      elements: { intro: { type: "Text", props: { labels: { content: "After" } } } },
    };

    const focusElement = vi.fn();
    const ensureLayoutSession = vi.fn(async () => ({ focusElement }));
    const applySpec = vi.fn(async () => nextSpec);
    const flushPersist = vi.fn(async () => undefined);
    const getSpec = vi.fn().mockResolvedValueOnce(previousSpec).mockResolvedValueOnce(nextSpec);

    const tool = createPatchLayoutDraftTool(
      {
        storage: {
          findDocumentById: vi.fn(async () => documentRow("layout-1", "layout")),
          findCollectionSlug: vi.fn(async () => null),
          recordDocumentOp: vi.fn(async () => ({ serverVersion: 1 })),
        },
        layout: {
          update: vi.fn(),
          get: vi.fn(async () => ({
            id: "layout-1",
            updatedAt: new Date(),
            data: { spec: nextSpec },
          })),
        },
        authorization: { check: vi.fn(async () => true) } as never,
        artifacts: { push: vi.fn(), list: vi.fn(() => []) },
        runContext,
        layoutCollabRooms: { getSpec, applySpec, flushPersist },
        collabRuntime: { ensureLayoutSession } as never,
      },
      "org-1",
    );

    const result = await tool.execute?.(
      { layoutDocumentId: "layout-1", spec: nextSpec, focusElementId: "intro" },
      {} as never,
    );

    expect(result).toMatchObject({ updated: true, via: "collab" });
    expect(applySpec).toHaveBeenCalledWith("org-1", "layout-1", nextSpec);
    expect(ensureLayoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        layoutDocumentId: "layout-1",
        agentSlug: "local-test-agent",
        agentLabel: "Local test agent",
        userId: "agent-1",
      }),
    );
    expect(focusElement).toHaveBeenCalledWith("intro", previousSpec, nextSpec);
  });
});
