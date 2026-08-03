import { describe, expect, it } from "vitest";
import { formatTagsInput, parseTagsInput } from "./document-tags";

describe("document-tags (client)", () => {
  it("parses comma-separated tags lowercase and deduped", () => {
    expect(parseTagsInput(" Marketing , marketing , Sales ")).toEqual(["marketing", "sales"]);
  });

  it("formats tags for display", () => {
    expect(formatTagsInput(["marketing", "landing"])).toBe("marketing, landing");
  });
});
