import { describe, expect, it } from "vitest";
import { extractTagsFromBody, normalizeTags } from "./document-tags";

describe("document-tags", () => {
  it("normalizes tag slugs lowercase and deduped", () => {
    expect(normalizeTags(["Marketing", " marketing ", "Home"])).toEqual(["marketing", "home"]);
  });

  it("extracts tags from request body", () => {
    const { tags, data } = extractTagsFromBody({
      title: "Hello",
      tags: ["Marketing"],
    });
    expect(tags).toEqual(["marketing"]);
    expect(data).toEqual({ title: "Hello" });
  });
});
