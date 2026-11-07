import { describe, expect, it } from "vitest";
import { computeRouteHashes } from "./route-hashes";

const pages = [
  { key: "home", layoutRef: "home-layout", contentRef: "home-content" },
  { key: "products", layoutRef: "products-layout", contentRef: "products-content" },
];

const layouts = [
  { key: "home-layout", data: { elements: { a: { type: "TextBase" } } } },
  { key: "products-layout", data: { elements: { b: { type: "ProductGrid" } } } },
];

describe("computeRouteHashes", () => {
  it("is independent of page and layout order", () => {
    const a = computeRouteHashes(pages, layouts);
    const b = computeRouteHashes([...pages].reverse(), [...layouts].reverse());
    expect(a).toEqual(b);
  });

  it("changes only the edited route", () => {
    const before = computeRouteHashes(pages, layouts);
    const after = computeRouteHashes(
      pages,
      layouts.map((layout) =>
        layout.key === "products-layout"
          ? {
              ...layout,
              data: { elements: { b: { type: "ProductGrid" }, c: { type: "TextBase" } } },
            }
          : layout,
      ),
    );

    expect(after.home).toBe(before.home);
    expect(after.products).not.toBe(before.products);
  });

  it("changes when the route points at another layout or content", () => {
    const before = computeRouteHashes(pages, layouts);
    const after = computeRouteHashes(
      [{ ...pages[0]!, layoutRef: "products-layout" }, pages[1]!],
      layouts,
    );
    expect(after.home).not.toBe(before.home);
  });
});
