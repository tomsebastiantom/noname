import { describe, expect, it } from "vitest";
import {
  extractCollectionFromBody,
  normalizeCollectionSlug,
  parseCollectionId,
} from "./document-collection";

describe("document-collection", () => {
  it("normalizes folder slug", () => {
    expect(normalizeCollectionSlug(" Marketing ")).toBe("marketing");
    expect(normalizeCollectionSlug("")).toBeNull();
  });

  it("extracts collectionId from request body", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const { collectionId, data } = extractCollectionFromBody({
      title: "Hero",
      collectionId: id,
    });
    expect(collectionId).toBe(id);
    expect(data).toEqual({ title: "Hero" });
  });

  it("clears folder when collectionId is empty", () => {
    expect(parseCollectionId("")).toBeNull();
    expect(parseCollectionId(null)).toBeNull();
  });
});
