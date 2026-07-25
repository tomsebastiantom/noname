import { describe, expect, it } from "vitest";
import { documentIdFromRef, parseDocumentRef } from "./refs";

describe("document refs", () => {
  it("parses canonical documentId", () => {
    expect(parseDocumentRef({ documentId: "doc-1" })).toEqual({ documentId: "doc-1" });
    expect(parseDocumentRef("doc-2")).toEqual({ documentId: "doc-2" });
  });

  it("accepts legacy assetId and entryId keys", () => {
    expect(documentIdFromRef({ assetId: "asset-1" })).toBe("asset-1");
    expect(documentIdFromRef({ entryId: "entry-1" })).toBe("entry-1");
  });

  it("returns null for invalid refs", () => {
    expect(parseDocumentRef({})).toBeNull();
    expect(parseDocumentRef(null)).toBeNull();
  });
});
