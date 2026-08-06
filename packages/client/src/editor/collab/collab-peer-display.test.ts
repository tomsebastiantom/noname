import { describe, expect, it } from "vitest";
import {
  COLLAB_HUMAN_FALLBACK,
  dedupeCollabPeersByUser,
  formatCollabPeerLabel,
  partitionCollabPeers,
} from "./collab-peer-display";
import type { CollabPeerPresence } from "./presence";

function peer(
  overrides: Partial<CollabPeerPresence> & Pick<CollabPeerPresence, "peerId">,
): CollabPeerPresence {
  return {
    userId: overrides.userId ?? "u1",
    peerKind: overrides.peerKind ?? "human",
    displayName: overrides.displayName ?? null,
    selectedElementId: overrides.selectedElementId ?? null,
    cursorX: overrides.cursorX ?? null,
    cursorY: overrides.cursorY ?? null,
    peerId: overrides.peerId,
  };
}

describe("collab-peer-display", () => {
  it("uses Collaborator instead of Editor for unnamed humans", () => {
    expect(
      formatCollabPeerLabel(peer({ peerId: "p1" }), {
        humanFallback: COLLAB_HUMAN_FALLBACK,
        agentFallback: "Agent",
      }),
    ).toBe("Collaborator");
  });

  it("partitions humans and agents", () => {
    const humans = [peer({ peerId: "h1" }), peer({ peerId: "h2", userId: "u2" })];
    const agents = [peer({ peerId: "a1", peerKind: "agent", displayName: "Local test agent" })];
    expect(partitionCollabPeers([...humans, ...agents])).toEqual({ humans, agents });
  });

  it("dedupes stale agent reconnects for the same userId", () => {
    const stale = peer({
      peerId: "old",
      userId: "agent-owner",
      peerKind: "agent",
      displayName: "Local test agent",
    });
    const fresh = peer({
      peerId: "new",
      userId: "agent-owner",
      peerKind: "agent",
      displayName: "Local test agent",
    });
    expect(dedupeCollabPeersByUser([stale, fresh])).toEqual([fresh]);
    expect(partitionCollabPeers([stale, fresh]).agents).toEqual([fresh]);
  });

  it("prefers named human over unnamed duplicate for the same userId", () => {
    const unnamed = peer({ peerId: "old", userId: "u1", displayName: null });
    const named = peer({ peerId: "new", userId: "u1", displayName: "admin" });
    expect(dedupeCollabPeersByUser([unnamed, named])).toEqual([named]);
    expect(partitionCollabPeers([unnamed, named]).humans).toEqual([named]);
  });
});
