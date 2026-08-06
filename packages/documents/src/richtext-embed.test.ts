import { describe, expect, it } from "vitest";
import { embedBlockLabel, embeddedAssetBlockNode, parseEmbedTarget } from "./richtext-embed";

describe("richtext embed helpers", () => {
  it("parses asset embed target", () => {
    const node = embeddedAssetBlockNode({ documentId: "a1", altText: "Hero" });
    const target = parseEmbedTarget(node.data);
    expect(target?.type).toBe("asset");
    expect(target?.documentId).toBe("a1");
    expect(embedBlockLabel(node)).toBe("Hero");
  });
});
