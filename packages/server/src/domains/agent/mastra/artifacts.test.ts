import { describe, expect, it } from "vitest";
import { extractContentData, extractLayoutSpec } from "./artifacts";

describe("extractLayoutSpec", () => {
  it("unwraps nested spec objects", () => {
    expect(extractLayoutSpec({ spec: { type: "container", children: [] } })).toEqual({
      type: "container",
      children: [],
    });
  });

  it("returns a default container when response is empty", () => {
    expect(extractLayoutSpec(null)).toEqual({ type: "container", props: {}, children: [] });
  });
});

describe("extractContentData", () => {
  it("passes through object responses", () => {
    expect(extractContentData({ title: "Hello" })).toEqual({ title: "Hello" });
  });

  it("wraps primitive responses", () => {
    expect(extractContentData("Hello")).toEqual({ title: "Generated content", body: "Hello" });
  });
});
