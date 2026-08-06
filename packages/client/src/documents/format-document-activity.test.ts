import { describe, expect, it, vi } from "vitest";
import type { DocumentOpRow } from "./document-ops";
import { formatDocumentActivity, pickActivityOp } from "./format-document-activity";

vi.mock("../auth/session", () => ({
  sessionUserId: vi.fn(() => "user-alice"),
}));

const labels = {
  lastEditTemplate: "{actor} edited {timeAgo}",
  lastPublishTemplate: "{actor} published {timeAgo}",
  lastEditYouLabel: "You",
  lastEditAgentLabel: "Agent",
  lastEditSomeoneLabel: "Someone",
};

function op(partial: Partial<DocumentOpRow>): DocumentOpRow {
  return {
    id: "op-1",
    orgId: "org-1",
    documentId: "doc-1",
    serverVersion: 1,
    operation: "update",
    actorType: "human",
    actorId: "user-alice",
    onBehalfOf: null,
    taskId: null,
    clientId: null,
    clientSeq: null,
    payload: null,
    createdAt: "2026-08-06T11:58:00.000Z",
    ...partial,
  };
}

describe("formatDocumentActivity", () => {
  it("formats you edited relative time", () => {
    const now = Date.parse("2026-08-06T12:00:00.000Z");
    const text = formatDocumentActivity(op({}), labels, now);
    expect(text).toMatch(/^You edited /);
  });

  it("formats publish activity", () => {
    const now = Date.parse("2026-08-06T12:00:00.000Z");
    const text = formatDocumentActivity(op({ operation: "publish" }), labels, now);
    expect(text).toMatch(/^You published /);
  });

  it("picks latest non-delete op", () => {
    const picked = pickActivityOp([
      op({ id: "op-1", serverVersion: 1 }),
      op({ id: "op-2", operation: "delete", serverVersion: 2 }),
    ]);
    expect(picked?.id).toBe("op-1");
  });
});
