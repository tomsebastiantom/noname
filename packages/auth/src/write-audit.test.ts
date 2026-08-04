import { describe, expect, it } from "vitest";
import { writeAuditFromActor, withWriteAudit } from "./write-audit";

describe("writeAuditFromActor", () => {
  it("maps human actor", () => {
    expect(
      writeAuditFromActor({
        type: "human",
        userId: "user-1",
        permissions: [],
      }),
    ).toEqual({
      actorType: "human",
      actorId: "user-1",
      taskId: undefined,
    });
  });

  it("maps agent actor with onBehalfOf", () => {
    expect(
      writeAuditFromActor(
        {
          type: "agent",
          agentId: "agent-uuid",
          agentSlug: "copy-bot",
          onBehalfOf: "user-1",
          orgId: "org-1",
          permissions: [],
        },
        "task-9",
      ),
    ).toEqual({
      actorType: "agent",
      actorId: "agent-uuid",
      onBehalfOf: "user-1",
      taskId: "task-9",
    });
  });

  it("merges audit into event payload", () => {
    expect(
      withWriteAudit({ id: "doc-1" }, {
        actorType: "human",
        actorId: "user-1",
      }),
    ).toEqual({
      id: "doc-1",
      actorType: "human",
      actorId: "user-1",
    });
  });
});
