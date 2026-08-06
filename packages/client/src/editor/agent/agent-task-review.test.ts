import { describe, expect, it } from "vitest";
import type { OrchestrateOutput } from "../../auth/agents";
import {
  taskNeedsColdReview,
  taskNeedsHumanReview,
  taskShowsLiveUndo,
} from "./agent-task-review";

function output(partial: Partial<OrchestrateOutput>): OrchestrateOutput {
  return {
    summary: "",
    steps: [],
    artifacts: [],
    stoppedReason: "completed",
    ...partial,
  };
}

describe("taskShowsLiveUndo", () => {
  it("is true for live layout patches with revertSpec", () => {
    expect(
      taskShowsLiveUndo(
        output({
          artifacts: [
            {
              kind: "layout",
              label: "home",
              documentId: "doc-1",
              revertSpec: { root: "intro", elements: {} },
              liveEditorPatch: true,
            },
          ],
        }),
        "doc-1",
      ),
    ).toBe(true);
  });

  it("is false when revertSpec is missing", () => {
    expect(
      taskShowsLiveUndo(
        output({
          artifacts: [{ kind: "layout", label: "home", documentId: "doc-1" }],
        }),
        "doc-1",
      ),
    ).toBe(false);
  });
});

describe("taskNeedsColdReview", () => {
  it("is false when only a live undo layout artifact exists", () => {
    expect(
      taskNeedsColdReview(
        output({
          artifacts: [
            {
              kind: "layout",
              label: "home",
              documentId: "doc-1",
              revertSpec: { root: "intro", elements: {} },
              liveEditorPatch: true,
            },
          ],
        }),
        "doc-1",
      ),
    ).toBe(false);
  });

  it("is true for non-layout artifacts", () => {
    expect(
      taskNeedsColdReview(
        output({
          artifacts: [{ kind: "content", label: "page", documentId: "content-1" }],
        }),
        "doc-1",
      ),
    ).toBe(true);
  });
});

describe("taskNeedsHumanReview", () => {
  it("is false for chat-only planner steps", () => {
    expect(
      taskNeedsHumanReview(
        output({
          steps: [
            {
              index: 0,
              tool: "planner",
              status: "ok",
              startedAt: "2026-08-06T12:00:00.000Z",
              durationMs: 0,
            },
          ],
        }),
      ),
    ).toBe(false);
  });

  it("is true when draft artifacts exist", () => {
    expect(
      taskNeedsHumanReview(
        output({
          artifacts: [{ kind: "layout", label: "home", documentId: "doc-1" }],
        }),
      ),
    ).toBe(true);
  });
});
