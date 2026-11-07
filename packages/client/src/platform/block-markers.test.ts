import type { ComponentRegistry } from "@json-render/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { withBlockMarkers } from "./block-markers";

describe("withBlockMarkers", () => {
  it("emits data-block-type around every block", () => {
    const registry = {
      Hero: () => createElement("span", null, "hello"),
    } as unknown as ComponentRegistry;

    const marked = withBlockMarkers(registry);
    const props = {
      element: { type: "Hero", props: {} },
      emit: () => {},
      on: () => ({ emit: () => {}, shouldPreventDefault: false, bound: false }),
    };

    const html = renderToStaticMarkup(createElement(marked.Hero as never, props as never));

    expect(html).toContain('data-block-type="Hero"');
    expect(html).toContain("display:contents");
    expect(html).toContain("hello");
  });
});
