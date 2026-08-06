import { describe, expect, it } from "vitest";
import type { CollabPeerPresence } from "./presence";
import { remoteCollabPeers } from "./presence";

function peer(
  overrides: Partial<CollabPeerPresence> & Pick<CollabPeerPresence, "peerId">,
): CollabPeerPresence {
  return {
    userId: overrides.userId ?? "u1",
    peerKind: overrides.peerKind ?? "human",
    displayName: overrides.displayName ?? "admin",
    selectedElementId: null,
    cursorX: null,
    cursorY: null,
    peerId: overrides.peerId,
  };
}

describe("remoteCollabPeers", () => {
  it("excludes self by peerId", () => {
    const peers = [peer({ peerId: "self" }), peer({ peerId: "other", userId: "u2" })];
    expect(remoteCollabPeers(peers, "self", "u1")).toEqual([peers[1]]);
  });

  it("hides same-user human tabs from Live bar", () => {
    const otherTab = peer({ peerId: "tab-2", userId: "u1", displayName: "admin" });
    const teammate = peer({ peerId: "tab-3", userId: "u2", displayName: "Sam" });
    expect(remoteCollabPeers([otherTab, teammate], "tab-1", "u1")).toEqual([teammate]);
  });

  it("still shows agents for the same user account", () => {
    const agent = peer({
      peerId: "agent-1",
      userId: "agent-reg-id",
      peerKind: "agent",
      displayName: "Local test agent",
    });
    expect(remoteCollabPeers([agent], "tab-1", "u1")).toEqual([agent]);
  });
});
