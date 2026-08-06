import { describe, expect, it, vi } from "vitest";
import { mintCollabTicket, verifyCollabTicket } from "./collab-ticket";

describe("collab-ticket", () => {
  it("mints and verifies layout collab tickets", () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-collab-secret");

    const { ticket } = mintCollabTicket("user-1", "org-1", "layout-doc-1", {
      displayName: "admin",
    });
    const parsed = verifyCollabTicket(ticket);

    expect(parsed).toEqual({
      userId: "user-1",
      orgId: "org-1",
      layoutDocumentId: "layout-doc-1",
      exp: expect.any(Number),
      displayName: "admin",
    });
  });

  it("rejects tickets without displayName at mint", () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-collab-secret");

    expect(() => mintCollabTicket("user-1", "org-1", "layout-doc-1")).toThrow(
      "displayName required for collab tickets",
    );
  });

  it("mints human tickets with displayName", () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-collab-secret");

    const { ticket } = mintCollabTicket("user-1", "org-1", "layout-doc-1", {
      displayName: "admin",
    });
    const parsed = verifyCollabTicket(ticket);

    expect(parsed).toEqual({
      userId: "user-1",
      orgId: "org-1",
      layoutDocumentId: "layout-doc-1",
      exp: expect.any(Number),
      displayName: "admin",
    });
  });

  it("mints agent tickets with peer metadata", () => {
    vi.stubEnv("WORKER_SERVER_SECRET", "test-collab-secret");

    const { ticket } = mintCollabTicket("user-1", "org-1", "layout-doc-1", {
      peerKind: "agent",
      displayName: "Local test agent",
    });
    const parsed = verifyCollabTicket(ticket);

    expect(parsed).toEqual({
      userId: "user-1",
      orgId: "org-1",
      layoutDocumentId: "layout-doc-1",
      exp: expect.any(Number),
      peerKind: "agent",
      displayName: "Local test agent",
    });
  });
});
