import { describe, expect, it } from "vitest";
import { mergeOrchestrateProgress } from "./orchestrate-progress";

describe("mergeOrchestrateProgress", () => {
  it("keeps earlier steps when a later snapshot omits them", () => {
    const merged = mergeOrchestrateProgress(
      {
        summary: "Joined live layout collab",
        steps: [
          {
            index: 0,
            tool: "joinLayoutCollab",
            status: "ok",
            startedAt: "2026-08-01T12:00:00.000Z",
            durationMs: 0,
          },
        ],
        artifacts: [],
        stoppedReason: "completed",
      },
      {
        summary: "Planning with openai/gpt-4o-mini…",
        steps: [],
        artifacts: [],
        stoppedReason: "completed",
      },
    );

    expect(merged.summary).toBe("Planning with openai/gpt-4o-mini…");
    expect(merged.steps).toHaveLength(1);
    expect((merged.steps as Array<{ tool: string }>)[0]?.tool).toBe("joinLayoutCollab");
  });
});
