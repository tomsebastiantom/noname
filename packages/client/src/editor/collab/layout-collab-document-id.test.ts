import { type AnyDocumentId, interpretAsDocumentId } from "@automerge/automerge-repo/slim";
import { describe, expect, it, vi } from "vitest";
import { resolveLayoutCollabDocumentId } from "./layout-collab-document-id";

const LAYOUT_UUID = "3f6d5a4e-1c2b-4a5d-8e9f-0a1b2c3d4e5f";
const EXPECTED_DOCUMENT_ID = "tFb811rMxq54n84WKx3Lpi7svmn";

describe("resolveLayoutCollabDocumentId", () => {
  it("maps legacy UUIDs deterministically", () => {
    expect(resolveLayoutCollabDocumentId(LAYOUT_UUID)).toBe(EXPECTED_DOCUMENT_ID);
    expect(resolveLayoutCollabDocumentId(LAYOUT_UUID.toUpperCase())).toBe(EXPECTED_DOCUMENT_ID);
  });

  it("matches interpretAsDocumentId's legacy UUID mapping", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(interpretAsDocumentId(LAYOUT_UUID as AnyDocumentId)).toBe(
        resolveLayoutCollabDocumentId(LAYOUT_UUID),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it("passes through automerge URLs and base58check document ids", () => {
    expect(resolveLayoutCollabDocumentId(`automerge:${EXPECTED_DOCUMENT_ID}`)).toBe(
      EXPECTED_DOCUMENT_ID,
    );
    expect(resolveLayoutCollabDocumentId(EXPECTED_DOCUMENT_ID)).toBe(EXPECTED_DOCUMENT_ID);
  });

  it("rejects non-UUID strings", () => {
    expect(() => resolveLayoutCollabDocumentId("not-a-doc-id")).toThrow();
    expect(() => resolveLayoutCollabDocumentId("3f6d5a4e1c2b4a5d8e9f0a1b2c3d4e5f")).toThrow();
  });
});
