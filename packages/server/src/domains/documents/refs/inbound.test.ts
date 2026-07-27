import { describe, expect, it } from "vitest";
import type { DocumentDTO } from "../ports";
import { findInboundRefsInDocument } from "./inbound";

function doc(id: string, type: string, data: Record<string, unknown>): DocumentDTO {
  return {
    id,
    orgId: "org-1",
    type,
    key: id,
    version: 1,
    segment: "default",
    status: "published",
    baseVersion: null,
    data,
    meta: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("findInboundRefsInDocument", () => {
  it("finds documentId refs in content data", () => {
    const product = doc("prod-1", "product", {
      category: { documentId: "cat-1" },
      hero: { documentId: "asset-1" },
    });
    expect(findInboundRefsInDocument(product, "cat-1")).toEqual([
      expect.objectContaining({ id: "prod-1", fieldPath: "data.category" }),
    ]);
  });

  it("finds legacy assetId keys", () => {
    const product = doc("prod-1", "product", { hero: { assetId: "asset-1" } });
    expect(findInboundRefsInDocument(product, "asset-1")).toHaveLength(1);
  });

  it("finds bare string contentRef-style values", () => {
    const page = doc("page-1", "page", { contentRef: "entry-1" });
    expect(findInboundRefsInDocument(page, "entry-1")[0]?.fieldPath).toBe("data.contentRef");
  });
});
