export type CollabPeerPresence = {
  peerId: string;
  userId: string;
  peerKind: "human" | "agent";
  displayName: string | null;
  selectedElementId: string | null;
  cursorX: number | null;
  cursorY: number | null;
};

export type CollabPresenceUpdate = {
  peerKind?: "human" | "agent";
  selectedElementId?: string | null;
  cursorX?: number | null;
  cursorY?: number | null;
};

export type CollabPresenceClientMessage = {
  type: "presence";
  peerKind?: "human" | "agent";
  displayName?: string | null;
  selectedElementId?: string | null;
  cursorX?: number | null;
  cursorY?: number | null;
};

export type CollabPresenceServerMessage = {
  type: "presence-sync";
  selfPeerId: string;
  peers: CollabPeerPresence[];
};

export type CollabAgentTaskServerMessage = {
  type: "agent-task";
  phase: "started" | "ended";
  taskId: string;
  registeredAgentId: string;
  displayName: string;
};

export function serializeCollabPresenceClientMessage(message: CollabPresenceClientMessage): string {
  return JSON.stringify(message);
}

export function parseCollabPresenceServerMessage(raw: string): CollabPresenceServerMessage | null {
  if (raw.length > 32_768) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.type !== "presence-sync" || typeof record.selfPeerId !== "string") return null;
    if (!Array.isArray(record.peers)) return null;

    const peers: CollabPeerPresence[] = [];
    for (const item of record.peers) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const peer = item as Record<string, unknown>;
      if (typeof peer.peerId !== "string" || typeof peer.userId !== "string") return null;
      const peerKind =
        peer.peerKind === "agent" || peer.peerKind === "human" ? peer.peerKind : "human";
      peers.push({
        peerId: peer.peerId,
        userId: peer.userId,
        peerKind,
        displayName: typeof peer.displayName === "string" ? peer.displayName : null,
        selectedElementId:
          typeof peer.selectedElementId === "string" ? peer.selectedElementId : null,
        cursorX:
          typeof peer.cursorX === "number" && Number.isFinite(peer.cursorX) ? peer.cursorX : null,
        cursorY:
          typeof peer.cursorY === "number" && Number.isFinite(peer.cursorY) ? peer.cursorY : null,
      });
    }

    return { type: "presence-sync", selfPeerId: record.selfPeerId, peers };
  } catch {
    return null;
  }
}

export function parseCollabAgentTaskServerMessage(
  raw: string,
): CollabAgentTaskServerMessage | null {
  if (raw.length > 4_096) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.type !== "agent-task") return null;
    if (record.phase !== "started" && record.phase !== "ended") return null;
    if (typeof record.taskId !== "string" || typeof record.registeredAgentId !== "string") {
      return null;
    }
    if (typeof record.displayName !== "string" || !record.displayName.trim()) return null;
    return {
      type: "agent-task",
      phase: record.phase,
      taskId: record.taskId,
      registeredAgentId: record.registeredAgentId,
      displayName: record.displayName.trim().slice(0, 120),
    };
  } catch {
    return null;
  }
}

const PEER_HUES = [210, 150, 30, 280, 0, 180, 330, 60];

export function peerPresenceColor(
  peerId: string,
  peerKind: CollabPeerPresence["peerKind"] = "human",
): string {
  if (peerKind === "agent") {
    return "hsl(270 65% 50%)";
  }
  let index = 0;
  for (let i = 0; i < peerId.length; i += 1) {
    index = (index + peerId.charCodeAt(i) * 17) % PEER_HUES.length;
  }
  return `hsl(${PEER_HUES[index]} 70% 45%)`;
}

export function remoteCollabPeers(
  peers: CollabPeerPresence[],
  selfPeerId: string | null,
  selfUserId: string | null = null,
): CollabPeerPresence[] {
  return peers.filter((peer) => {
    if (selfPeerId && peer.peerId === selfPeerId) return false;
    // Same account in another tab — still syncs via Automerge, not shown as a extra person.
    if (selfUserId && peer.peerKind === "human" && peer.userId === selfUserId) return false;
    return true;
  });
}

export {
  COLLAB_AGENT_FALLBACK,
  COLLAB_HUMAN_FALLBACK,
  formatCollabPeerLabel,
} from "./collab-peer-display";
