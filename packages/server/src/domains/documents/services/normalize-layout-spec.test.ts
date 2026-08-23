import { describe, expect, it } from "vitest";
import { layoutSpecsEqual, normalizeLayoutSpec } from "./normalize-layout-spec";

describe("normalizeLayoutSpec", () => {
  it("keeps TextBase props.content at the top level (flat props)", () => {
    const spec = {
      root: "page",
      elements: {
        intro: {
          type: "TextBase",
          props: { variant: "body", content: "Agent works finally" },
        },
      },
    };
    const normalized = normalizeLayoutSpec(spec);
    expect(
      (normalized.elements as Record<string, { props: { content: string } }>).intro.props.content,
    ).toBe("Agent works finally");
  });

  it("moves TextBase props.text into props.content", () => {
    const spec = {
      root: "page",
      elements: {
        intro: {
          type: "TextBase",
          props: { variant: "body", text: "Agent works finally" },
        },
      },
    };
    const normalized = normalizeLayoutSpec(spec);
    const props = (normalized.elements as Record<string, { props: Record<string, unknown> }>).intro
      .props;
    expect(props.content).toBe("Agent works finally");
    expect(props.text).toBeUndefined();
  });

  it("detects unchanged specs", () => {
    const spec = { root: "a", elements: {} };
    expect(layoutSpecsEqual(spec, { root: "a", elements: {} })).toBe(true);
    expect(layoutSpecsEqual(spec, { root: "b", elements: {} })).toBe(false);
  });
});
