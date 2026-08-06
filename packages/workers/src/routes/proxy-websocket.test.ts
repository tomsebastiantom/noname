import { describe, expect, it } from "vitest";
import {
  isCollabLayoutWsWithTicket,
  isCollabRichTextWsWithTicket,
  isCollabWsWithTicket,
  isWebSocketUpgrade,
} from "./proxy-websocket";

describe("proxy-websocket", () => {
  it("detects websocket upgrade", () => {
    expect(isWebSocketUpgrade("websocket")).toBe(true);
    expect(isWebSocketUpgrade("WebSocket")).toBe(true);
    expect(isWebSocketUpgrade(undefined)).toBe(false);
  });

  it("detects collab layout ws with ticket", () => {
    const url = new URL("https://yogastore.localhost/api/collab/layout/ws?collab_ticket=abc");
    expect(isCollabLayoutWsWithTicket(url)).toBe(true);
    expect(
      isCollabLayoutWsWithTicket(new URL("https://yogastore.localhost/api/collab/layout/ws")),
    ).toBe(false);
  });

  it("detects collab rich text ws with ticket", () => {
    const url = new URL(
      "https://yogastore.localhost/api/collab/richtext/ws/org:doc:description:en-US?collab_ticket=abc",
    );
    expect(isCollabRichTextWsWithTicket(url)).toBe(true);
    expect(isCollabWsWithTicket(url)).toBe(true);
  });
});
