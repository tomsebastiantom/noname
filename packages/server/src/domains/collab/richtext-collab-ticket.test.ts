import { describe, expect, it } from "vitest";
import {
  buildRichTextCollabRoomName,
  mintRichTextCollabTicket,
  parseRichTextCollabRoomName,
  verifyRichTextCollabTicket,
} from "./richtext-collab-ticket";

describe("rich text collab ticket", () => {
  it("builds and parses room names", () => {
    const roomName = buildRichTextCollabRoomName("org-1", "doc-1", "description", "en-US");
    expect(parseRichTextCollabRoomName(roomName)).toEqual({
      orgId: "org-1",
      contentDocumentId: "doc-1",
      fieldKey: "description",
      locale: "en-US",
    });
  });

  it("mints and verifies tickets", () => {
    process.env.WORKER_SERVER_SECRET = "test-secret";
    const minted = mintRichTextCollabTicket("user-1", "org-1", "doc-1", "description", "en-US");
    const verified = verifyRichTextCollabTicket(minted.ticket);
    expect(verified).toMatchObject({
      userId: "user-1",
      orgId: "org-1",
      contentDocumentId: "doc-1",
      fieldKey: "description",
      locale: "en-US",
    });
    expect(minted.roomName).toBe("org-1:doc-1:description:en-US");
  });
});
