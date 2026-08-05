import { describe, expect, it } from "vitest";
import { ORCHESTRATE_TOOL_IDS, resolveActiveTools } from "./guards";

describe("resolveActiveTools", () => {
  it("returns all orchestrate tools when allowedTools is empty", () => {
    expect(resolveActiveTools(null)).toEqual([...ORCHESTRATE_TOOL_IDS]);
  });

  it("never exposes denied tools such as publish", () => {
    expect(resolveActiveTools(["readAnalytics", "publish", "generateLayoutDraft"])).toEqual([
      "readAnalytics",
      "generateLayoutDraft",
    ]);
  });

  it("ignores unknown tool names", () => {
    expect(resolveActiveTools(["readAnalytics", "unknownTool"])).toEqual(["readAnalytics"]);
  });
});
