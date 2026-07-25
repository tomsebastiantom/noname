import { describe, expect, it } from "vitest";
import { parseContentRef, resolveSpecWithState } from "./resolve-spec";

describe("parseContentRef", () => {
  it("parses type:id", () => {
    expect(parseContentRef("product:abc-123")).toEqual({ type: "product", id: "abc-123" });
  });

  it("rejects invalid refs", () => {
    expect(parseContentRef("product")).toBeNull();
    expect(parseContentRef(":id")).toBeNull();
  });
});

describe("resolveSpecWithState", () => {
  it("resolves $state bindings in element props", () => {
    const spec = {
      root: "card",
      elements: {
        card: {
          type: "ProductCard",
          props: {
            title: { $state: "title" },
            price: { $state: "price" },
            productId: "static-id",
          },
        },
      },
    };

    const resolved = resolveSpecWithState(spec, { title: "Blue Sneakers", price: 99.99 });

    expect(resolved.elements).toEqual({
      card: {
        type: "ProductCard",
        props: {
          title: "Blue Sneakers",
          price: 99.99,
          productId: "static-id",
        },
      },
    });
  });
});
