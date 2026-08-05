import { describe, expect, it } from "vitest";
import { mapMastraSteps, stoppedReasonFromFinish } from "./format-steps";

describe("mapMastraSteps", () => {
  it("maps tool results into step records", () => {
    const steps = mapMastraSteps([
      {
        text: "done",
        toolResults: [
          {
            toolName: "readAnalytics",
            args: { limit: 5 },
            result: { eventCount: 2 },
          },
        ],
      } as never,
    ]);

    expect(steps).toHaveLength(1);
    expect(steps[0]?.tool).toBe("readAnalytics");
    expect(steps[0]?.status).toBe("ok");
  });
});

describe("stoppedReasonFromFinish", () => {
  it("maps length finish to max_steps", () => {
    expect(stoppedReasonFromFinish("length")).toBe("max_steps");
  });
});
