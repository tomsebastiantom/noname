export type CollabPeerPresence = {
  peerId: string;
  userId: string;
  peerKind: "human" | "agent";
  displayName: string | null;
  selectedElementId: string | null;
  cursorX: number | null;
  cursorY: number | null;
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

const MAX_DISPLAY_NAME = 120;
const MAX_ELEMENT_ID = 256;
const MAX_CURSOR = 50_000;

function trimOptionalString(value: unknown, maxLen: number): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

function trimOptionalCursor(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(MAX_CURSOR, Math.round(value)));
}

export function parseCollabPresenceClientMessage(raw: string): CollabPresenceClientMessage | null {
  if (raw.length > 4_096) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.type !== "presence") return null;

    const peerKind =
      record.peerKind === "agent" || record.peerKind === "human" ? record.peerKind : undefined;
    const displayName = trimOptionalString(record.displayName, MAX_DISPLAY_NAME);
    const selectedElementId = trimOptionalString(record.selectedElementId, MAX_ELEMENT_ID);
    const cursorX = trimOptionalCursor(record.cursorX);
    const cursorY = trimOptionalCursor(record.cursorY);
    if (record.displayName !== undefined && displayName === undefined) return null;
    if (record.selectedElementId !== undefined && selectedElementId === undefined) return null;
    if (record.cursorX !== undefined && cursorX === undefined) return null;
    if (record.cursorY !== undefined && cursorY === undefined) return null;

    return {
      type: "presence",
      ...(peerKind !== undefined ? { peerKind } : {}),
      ...(displayName !== undefined ? { displayName } : {}),
      ...(selectedElementId !== undefined ? { selectedElementId } : {}),
      ...(cursorX !== undefined ? { cursorX } : {}),
      ...(cursorY !== undefined ? { cursorY } : {}),
    };
  } catch {
    return null;
  }
}

export function serializeCollabPresenceServerMessage(message: CollabPresenceServerMessage): string {
  return JSON.stringify(message);
}

export function serializeCollabPresenceClientMessage(message: CollabPresenceClientMessage): string {
  return JSON.stringify(message);
}

export function serializeCollabAgentTaskServerMessage(message: CollabAgentTaskServerMessage): string {
  return JSON.stringify(message);
}

/** Per-recipient view — hide same-account human tabs (Google Docs style). */
export function collabPeersForRecipient(
  peers: CollabPeerPresence[],
  recipient: { peerId: string; userId: string; peerKind: "human" | "agent" },
): CollabPeerPresence[] {
  return peers.filter((peer) => {
    if (
      recipient.peerKind === "human" &&
      peer.peerKind === "human" &&
      peer.userId === recipient.userId &&
      peer.peerId !== recipient.peerId
    ) {
      return false;
    }
    return true;
  });
}

export function parseCollabAgentTaskServerMessage(raw: string): CollabAgentTaskServerMessage | null {
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
    const displayName = trimOptionalString(record.displayName, MAX_DISPLAY_NAME);
    if (!displayName) return null;
    return {
      type: "agent-task",
      phase: record.phase,
      taskId: record.taskId,
      registeredAgentId: record.registeredAgentId,
      displayName,
    };
  } catch {
    return null;
  }
}
