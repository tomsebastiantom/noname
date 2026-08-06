import { describe, expect, it } from "vitest";
import { parseRichTextConstraints, richTextToolbarFlags } from "./richtext-constraints";

describe("richtext constraints", () => {
  it("defaults to all toolbar flags when constraints are empty", () => {
    const flags = richTextToolbarFlags(parseRichTextConstraints(undefined));
    expect(flags.bold).toBe(true);
    expect(flags.table).toBe(true);
    expect(flags.videoBlock).toBe(true);
  });

  it("hides toolbar buttons for disallowed nodes and marks", () => {
    const flags = richTextToolbarFlags(
      parseRichTextConstraints({
        allowedNodeTypes: ["paragraph", "embedded-asset-block"],
        allowedMarks: ["bold"],
      }),
    );
    expect(flags.bold).toBe(true);
    expect(flags.italic).toBe(false);
    expect(flags.table).toBe(false);
    expect(flags.assetBlock).toBe(true);
    expect(flags.videoBlock).toBe(false);
  });
});
