import { describe, expect, it } from "vitest";
import { formatAgentTaskError } from "./format-agent-task-error";

describe("formatAgentTaskError", () => {
  it("humanizes automerge assertion failures", () => {
    expect(formatAgentTaskError("Assertion failed")).toContain("internal error");
  });

  it("humanizes layout collab assertion failures", () => {
    expect(formatAgentTaskError("layout collab apply failed: Assertion failed")).toContain(
      "live collaboration",
    );
  });
});
