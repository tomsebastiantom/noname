import { describe, expect, it } from "vitest";
import { inferAgentFailurePhase } from "./agent-failure-phase";

describe("inferAgentFailurePhase", () => {
  it("detects layout collab apply failures", () => {
    expect(inferAgentFailurePhase(null, "layout collab apply failed: Assertion failed")).toBe(
      "layout collab apply",
    );
    expect(inferAgentFailurePhase(null, "Assertion failed")).toBe("orchestrator run");
  });

  it("uses the last recorded step when available", () => {
    expect(
      inferAgentFailurePhase(
        {
          steps: [
            {
              index: 0,
              tool: "joinLayoutCollab",
              status: "ok",
              startedAt: "2026-08-01T12:00:00.000Z",
              durationMs: 0,
            },
            {
              index: 1,
              tool: "patchLayoutDraft",
              status: "ok",
              startedAt: "2026-08-01T12:00:01.000Z",
              durationMs: 0,
            },
          ],
        },
        "timeout",
      ),
    ).toBe("patchLayoutDraft (in progress)");
  });
});
