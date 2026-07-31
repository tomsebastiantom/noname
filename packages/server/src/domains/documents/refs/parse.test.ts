import { describe, expect, it } from "vitest";
import { documentIdFromRef, parseDocumentRef } from "./parse";

describe("document refs", () => {
  it("parses canonical documentId", () => {
    expect(parseDocumentRef({ documentId: "doc-1" })).toEqual({ documentId: "doc-1" });
    expect(parseDocumentRef("doc-2")).toEqual({ documentId: "doc-2" });
    expect(documentIdFromRef({ documentId: "doc-3" })).toBe("doc-3");
  });

  it("returns null for invalid refs", () => {
    expect(parseDocumentRef({})).toBeNull();
    expect(parseDocumentRef(null)).toBeNull();
    expect(documentIdFromRef({ assetId: "legacy" })).toBeNull();
    expect(documentIdFromRef({ entryId: "legacy" })).toBeNull();
  });
});
