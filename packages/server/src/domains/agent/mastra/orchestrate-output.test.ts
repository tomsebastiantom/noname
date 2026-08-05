import { describe, expect, it } from "vitest";
import { parseAgentRunContext, writeAuditFromRunContext } from "./context";
import { assertOrchestrateOutput, parseOrchestrateOutput } from "./orchestrate-output";

describe("parseOrchestrateOutput", () => {
  it("accepts a valid orchestrate output shape", () => {
    const output = assertOrchestrateOutput({
      summary: "Done",
      steps: [
        {
          index: 0,
          tool: "readAnalytics",
          status: "ok",
          startedAt: new Date().toISOString(),
          durationMs: 12,
        },
      ],
      artifacts: [{ kind: "layout", documentId: "doc-1", label: "hero" }],
      stoppedReason: "completed",
    });

    expect(output.summary).toBe("Done");
    expect(output.steps).toHaveLength(1);
    expect(output.artifacts[0]?.documentId).toBe("doc-1");
  });

  it("rejects malformed output", () => {
    expect(parseOrchestrateOutput({ summary: 123 })).toBeNull();
  });
});

describe("parseAgentRunContext", () => {
  it("builds run context from worker input", () => {
    const ctx = parseAgentRunContext("org-1", {
      taskId: "task-1",
      registeredAgentId: "agent-1",
      agentSlug: "copy-bot",
      onBehalfOf: "user-1",
    });

    expect(ctx).toEqual({
      orgId: "org-1",
      taskId: "task-1",
      registeredAgentId: "agent-1",
      agentSlug: "copy-bot",
      onBehalfOf: "user-1",
    });
  });

  it("returns null when required ids are missing", () => {
    expect(parseAgentRunContext("org-1", { taskId: "task-1" })).toBeNull();
  });
});

describe("writeAuditFromRunContext", () => {
  it("records agent attribution for document writes", () => {
    expect(
      writeAuditFromRunContext({
        orgId: "org-1",
        taskId: "task-1",
        registeredAgentId: "agent-1",
        agentSlug: "copy-bot",
        onBehalfOf: "user-1",
      }),
    ).toEqual({
      actorType: "agent",
      actorId: "agent-1",
      onBehalfOf: "user-1",
      taskId: "task-1",
    });
  });
});
