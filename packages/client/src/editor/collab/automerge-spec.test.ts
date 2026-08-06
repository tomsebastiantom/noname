import * as Automerge from "@automerge/automerge";
import type { Spec } from "@json-render/core";
import { describe, expect, it } from "vitest";
import {
  applyLocalSpecToDraft,
  automergeDocToSpec,
  detectCrossParentReparent,
  detectSingleParentChildrenReorder,
  pushLocalSpecChange,
  reorderChildrenListOps,
  specToAutomergeDoc,
} from "./automerge-spec";

const commerceSpec: Spec = {
  root: "main",
  elements: {
    main: { type: "Stack", props: {}, children: ["hero", "intro", "products"] },
    hero: { type: "Hero", props: {} },
    intro: { type: "Text", props: {} },
    products: { type: "ProductGrid", props: {} },
  },
};

describe("detectSingleParentChildrenReorder", () => {
  it("detects same-parent reorder only", () => {
    const next: Spec = {
      ...commerceSpec,
      elements: {
        ...commerceSpec.elements,
        main: { ...commerceSpec.elements!.main!, children: ["intro", "hero", "products"] },
      },
    };
    expect(detectSingleParentChildrenReorder(commerceSpec, next)).toEqual({
      parentId: "main",
      nextOrder: ["intro", "hero", "products"],
    });
  });

  it("returns null when a child is added", () => {
    const next: Spec = {
      ...commerceSpec,
      elements: {
        ...commerceSpec.elements,
        main: {
          ...commerceSpec.elements!.main!,
          children: ["hero", "intro", "products", "banner"],
        },
      },
    };
    expect(detectSingleParentChildrenReorder(commerceSpec, next)).toBeNull();
  });
});

describe("reorderChildrenListOps", () => {
  it("preserves concurrent sibling insert on merge", () => {
    const base = specToAutomergeDoc(commerceSpec);
    const alice = Automerge.change(Automerge.clone(base), (draft) => {
      reorderChildrenListOps(draft, "main", ["intro", "hero", "products"]);
    });
    const bob = Automerge.change(Automerge.clone(base), (draft) => {
      const elements = draft.elements as Record<
        string,
        {
          type?: string;
          props?: Record<string, unknown>;
          children?: { push: (id: string) => void };
        }
      >;
      elements.banner = { type: "Text", props: {} };
      elements.main!.children!.push("banner");
    });
    const merged = Automerge.merge(alice, bob);
    const spec = automergeDocToSpec(merged);
    expect(spec.elements!.main!.children).toEqual(["intro", "hero", "products", "banner"]);
    expect(spec.elements!.banner).toBeDefined();
  });
});

const twoColumnSpec: Spec = {
  root: "main",
  elements: {
    main: { type: "Stack", props: {}, children: ["col-a", "col-b"] },
    "col-a": { type: "Stack", props: {}, children: ["hero"] },
    "col-b": { type: "Stack", props: {}, children: ["intro", "products"] },
    hero: { type: "Hero", props: {} },
    intro: { type: "Text", props: {} },
    products: { type: "ProductGrid", props: {} },
  },
};

describe("detectCrossParentReparent", () => {
  it("detects moving one child between parents", () => {
    const next: Spec = {
      ...twoColumnSpec,
      elements: {
        ...twoColumnSpec.elements,
        "col-a": { ...twoColumnSpec.elements!["col-a"]!, children: ["hero", "intro"] },
        "col-b": { ...twoColumnSpec.elements!["col-b"]!, children: ["products"] },
      },
    };
    expect(detectCrossParentReparent(twoColumnSpec, next)).toEqual({
      elementId: "intro",
      fromParentId: "col-b",
      toParentId: "col-a",
      toIndex: 1,
    });
  });
});

describe("pushLocalSpecChange", () => {
  it("uses list ops for cross-parent reparent", () => {
    const reparented: Spec = {
      ...twoColumnSpec,
      elements: {
        ...twoColumnSpec.elements,
        "col-a": { ...twoColumnSpec.elements!["col-a"]!, children: ["hero", "intro"] },
        "col-b": { ...twoColumnSpec.elements!["col-b"]!, children: ["products"] },
      },
    };
    let doc = specToAutomergeDoc(twoColumnSpec);
    doc = pushLocalSpecChange(doc, twoColumnSpec, reparented);
    const spec = automergeDocToSpec(doc);
    expect(spec.elements!["col-a"]!.children).toEqual(["hero", "intro"]);
    expect(spec.elements!["col-b"]!.children).toEqual(["products"]);
  });

  it("uses list ops for reorder and merge for structural edits", () => {
    let doc = specToAutomergeDoc(commerceSpec);
    const reordered: Spec = {
      ...commerceSpec,
      elements: {
        ...commerceSpec.elements,
        main: { ...commerceSpec.elements!.main!, children: ["intro", "hero", "products"] },
      },
    };
    doc = pushLocalSpecChange(doc, commerceSpec, reordered);
    expect(automergeDocToSpec(doc).elements!.main!.children).toEqual(["intro", "hero", "products"]);
  });
});

describe("applyLocalSpecToDraft", () => {
  it("mutates nested label text in place (layout field edits)", () => {
    const prev: Spec = {
      root: "main",
      elements: {
        main: { type: "Stack", props: {}, children: ["promo"] },
        promo: {
          type: "Text",
          props: {
            config: { variant: "h3" },
            labels: { content: "Summer sale — 20% off yoga mats this week!" },
          },
        },
      },
    };
    const next: Spec = {
      ...prev,
      elements: {
        ...prev.elements,
        promo: {
          ...prev.elements!.promo!,
          props: {
            ...prev.elements!.promo!.props,
            labels: { content: "Winter Sale — 20% off yoga mats v this week!" },
          },
        },
      },
    };
    const doc = Automerge.change(specToAutomergeDoc(prev), (draft) => {
      applyLocalSpecToDraft(draft, prev, next);
    });
    const labels = (
      automergeDocToSpec(doc).elements!.promo!.props as { labels: { content: string } }
    ).labels;
    expect(labels.content).toBe("Winter Sale — 20% off yoga mats v this week!");
  });
});
