import { describe, expect, it } from "vitest";
import { documentIdFromFieldValue, documentIdFromRef, parseDocumentRef } from "./refs";

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

  it("parses form field JSON strings", () => {
    expect(documentIdFromFieldValue('{"documentId":"doc-4"}')).toBe("doc-4");
    expect(documentIdFromFieldValue("doc-5")).toBe("doc-5");
    expect(documentIdFromFieldValue("")).toBeNull();
  });
});
