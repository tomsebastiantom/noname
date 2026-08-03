import { describe, expect, it, vi } from "vitest";
import { createKetoAuthorizationAdapter } from "./authorization";

describe("createKetoAuthorizationAdapter", () => {
  it("returns allowed from check endpoint", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ allowed: true }),
    })) as unknown as typeof fetch;

    const authz = createKetoAuthorizationAdapter({
      readUrl: "http://keto-read",
      writeUrl: "http://keto-write",
      fetchImpl,
    });

    const allowed = await authz.check({
      subject: { type: "User", id: "user-1" },
      permission: "edit",
      namespace: "Document",
      objectId: "doc-1",
    });

    expect(allowed).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith("http://keto-read/relation-tuples/check/openapi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namespace: "Document",
        object: "doc-1",
        relation: "edit",
        subject_id: "User:user-1",
      }),
    });
  });

  it("grants via PUT admin relation-tuples", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => "",
    })) as unknown as typeof fetch;
    const authz = createKetoAuthorizationAdapter({
      readUrl: "http://keto-read",
      writeUrl: "http://keto-write",
      fetchImpl,
    });

    await authz.grant({
      namespace: "Document",
      objectId: "doc-1",
      relation: "editors",
      subject: { type: "User", id: "user-1" },
    });

    expect(fetchImpl).toHaveBeenCalledWith("http://keto-write/admin/relation-tuples", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namespace: "Document",
        object: "doc-1",
        relation: "editors",
        subject_id: "User:user-1",
      }),
    });
  });

  it("grants Team parent via subject_set for OPL traverse", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => "",
    })) as unknown as typeof fetch;
    const authz = createKetoAuthorizationAdapter({
      readUrl: "http://keto-read",
      writeUrl: "http://keto-write",
      fetchImpl,
    });

    await authz.grant({
      namespace: "Document",
      objectId: "doc-1",
      relation: "parents",
      subject: { type: "Team", id: "marketing" },
    });

    expect(fetchImpl).toHaveBeenCalledWith("http://keto-write/admin/relation-tuples", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        namespace: "Document",
        object: "doc-1",
        relation: "parents",
        subject_set: { namespace: "Team", object: "marketing", relation: "" },
      }),
    });
  });

  it("revokes via DELETE with query params", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      text: async () => "",
    })) as unknown as typeof fetch;
    const authz = createKetoAuthorizationAdapter({
      readUrl: "http://keto-read",
      writeUrl: "http://keto-write",
      fetchImpl,
    });

    await authz.revoke({
      namespace: "Document",
      objectId: "doc-1",
      relation: "editors",
      subject: { type: "User", id: "user-1" },
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://keto-write/admin/relation-tuples?namespace=Document&object=doc-1&relation=editors&subject_id=User%3Auser-1",
      { method: "DELETE" },
    );
  });

  it("lists direct user editors only", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        relation_tuples: [
          { subject_id: "User:user-1" },
          { subject_set: { namespace: "Store", object: "org-1", relation: "editors" } },
          { subject_id: "User:user-2" },
        ],
      }),
    })) as unknown as typeof fetch;
    const authz = createKetoAuthorizationAdapter({
      readUrl: "http://keto-read",
      writeUrl: "http://keto-write",
      fetchImpl,
    });

    await expect(authz.listDirectUserEditors("Document", "doc-1")).resolves.toEqual([
      { type: "User", id: "user-1" },
      { type: "User", id: "user-2" },
    ]);
  });
});
