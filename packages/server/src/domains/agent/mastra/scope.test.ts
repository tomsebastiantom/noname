import { describe, expect, it, vi } from "vitest";
import type { AuthorizationPort } from "../../auth/authorization-port";
import { agentCanEditDocument, agentCanViewCollection, agentCanViewDocument } from "./scope";

function mockAuth(checkImpl: AuthorizationPort["check"]): AuthorizationPort {
  return {
    check: checkImpl,
    grant: vi.fn(),
    revoke: vi.fn(),
    listDirectUserEditors: vi.fn(async () => []),
    listDirectUserPublishers: vi.fn(async () => []),
    listRelationTuples: vi.fn(async () => []),
  };
}

describe("agentCanViewCollection", () => {
  it("checks Collection view for agent subject", async () => {
    const check = vi.fn(async () => true);
    const allowed = await agentCanViewCollection(mockAuth(check), "demo-agent", "marketing");
    expect(allowed).toBe(true);
    expect(check).toHaveBeenCalledWith({
      subject: { type: "Agent", id: "demo-agent" },
      permission: "view",
      namespace: "Collection",
      objectId: "marketing",
    });
  });
});

describe("agentCanViewDocument", () => {
  it("falls back to Document when folder check fails", async () => {
    const check = vi.fn(async (input) => input.namespace === "Document");
    const allowed = await agentCanViewDocument(mockAuth(check), "demo-agent", {
      id: "doc-1",
      collectionSlug: "marketing",
    });
    expect(allowed).toBe(true);
    expect(check).toHaveBeenCalledTimes(2);
  });
});

describe("agentCanEditDocument", () => {
  it("checks Collection edit before Document edit", async () => {
    const check = vi.fn(
      async (input) => input.namespace === "Document" && input.permission === "edit",
    );
    const allowed = await agentCanEditDocument(mockAuth(check), "demo-agent", {
      id: "doc-1",
      collectionSlug: "marketing",
    });
    expect(allowed).toBe(true);
    expect(check).toHaveBeenCalledWith(
      expect.objectContaining({
        permission: "edit",
        namespace: "Collection",
        objectId: "marketing",
      }),
    );
  });
});
