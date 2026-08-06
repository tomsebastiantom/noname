import { describe, expect, it } from "vitest";
import { layoutSpecsEqual, normalizeLayoutSpec } from "./normalize-layout-spec";

describe("normalizeLayoutSpec", () => {
  it("moves Text props.content into props.labels.content", () => {
    const spec = {
      root: "page",
      elements: {
        intro: {
          type: "Text",
          props: { config: { variant: "body" }, content: "Agent works finally" },
        },
      },
    };
    const normalized = normalizeLayoutSpec(spec);
    expect(
      (normalized.elements as Record<string, { props: { labels: { content: string } } }>).intro
        .props.labels.content,
    ).toBe("Agent works finally");
  });

  it("detects unchanged specs", () => {
    const spec = { root: "a", elements: {} };
    expect(layoutSpecsEqual(spec, { root: "a", elements: {} })).toBe(true);
    expect(layoutSpecsEqual(spec, { root: "b", elements: {} })).toBe(false);
  });
});
