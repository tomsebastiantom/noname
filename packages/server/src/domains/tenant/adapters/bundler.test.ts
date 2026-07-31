import { describe, expect, it } from "vitest";
import { validateComponentSource } from "./bundler";

describe("validateComponentSource", () => {
  it("accepts normal component source", () => {
    expect(() =>
      validateComponentSource("const userCatalog = {}; const userComponents = {};"),
    ).not.toThrow();
  });

  it("rejects empty source", () => {
    expect(() => validateComponentSource("   ")).toThrow(/empty/);
  });

  it("rejects child_process imports", () => {
    expect(() => validateComponentSource("require('child_process')")).toThrow(/forbidden/);
  });
});
