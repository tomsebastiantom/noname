import { describe, expect, it } from "vitest";
import {
  parseCollabAgentTaskServerMessage,
  parseCollabPresenceClientMessage,
  collabPeersForRecipient,
  serializeCollabPresenceServerMessage,
} from "./presence";

describe("collab presence protocol", () => {
  it("parses valid client presence updates", () => {
    expect(
      parseCollabPresenceClientMessage(
        JSON.stringify({ type: "presence", selectedElementId: "hero", displayName: "Ada" }),
      ),
    ).toEqual({
      type: "presence",
      selectedElementId: "hero",
      displayName: "Ada",
    });
  });

  it("rejects oversized or invalid payloads", () => {
    expect(parseCollabPresenceClientMessage('{"type":"other"}')).toBeNull();
    expect(parseCollabPresenceClientMessage("not-json")).toBeNull();
    expect(
      parseCollabPresenceClientMessage(JSON.stringify({ type: "presence", displayName: 1 })),
    ).toBeNull();
  });

  it("serializes server sync messages", () => {
    const raw = serializeCollabPresenceServerMessage({
      type: "presence-sync",
      selfPeerId: "peer-a",
      peers: [
        {
          peerId: "peer-a",
          userId: "user-1",
          peerKind: "human",
          displayName: "Ada",
          selectedElementId: "hero",
          cursorX: 120,
          cursorY: 48,
        },
      ],
    });
    expect(JSON.parse(raw)).toEqual({
      type: "presence-sync",
      selfPeerId: "peer-a",
      peers: [
        {
          peerId: "peer-a",
          userId: "user-1",
          peerKind: "human",
          displayName: "Ada",
          selectedElementId: "hero",
          cursorX: 120,
          cursorY: 48,
        },
      ],
    });
  });

  it("parses agent-task push messages", () => {
    expect(
      parseCollabAgentTaskServerMessage(
        JSON.stringify({
          type: "agent-task",
          phase: "started",
          taskId: "task-1",
          registeredAgentId: "agent-1",
          displayName: "Local test agent",
        }),
      ),
    ).toEqual({
      type: "agent-task",
      phase: "started",
      taskId: "task-1",
      registeredAgentId: "agent-1",
      displayName: "Local test agent",
    });
  });

  it("hides same-user human tabs from each recipient snapshot", () => {
    const peers = [
      {
        peerId: "tab-1",
        userId: "u1",
        peerKind: "human" as const,
        displayName: "admin",
        selectedElementId: null,
        cursorX: null,
        cursorY: null,
      },
      {
        peerId: "tab-2",
        userId: "u1",
        peerKind: "human" as const,
        displayName: "admin",
        selectedElementId: null,
        cursorX: null,
        cursorY: null,
      },
      {
        peerId: "tab-3",
        userId: "u2",
        peerKind: "human" as const,
        displayName: "Sam",
        selectedElementId: null,
        cursorX: null,
        cursorY: null,
      },
    ];
    expect(collabPeersForRecipient(peers, { peerId: "tab-1", userId: "u1", peerKind: "human" })).toEqual([
      peers[0],
      peers[2],
    ]);
    expect(collabPeersForRecipient(peers, { peerId: "tab-2", userId: "u1", peerKind: "human" })).toEqual([
      peers[1],
      peers[2],
    ]);
  });
});
