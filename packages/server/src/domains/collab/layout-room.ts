import * as Automerge from "@automerge/automerge";
import { type DocHandle, type PeerId, Repo } from "@automerge/automerge-repo/slim";
import type { WSContext } from "hono/ws";
import type { Database } from "../../drizzle";
import { NotFoundError, ValidationError } from "../../shared/domain-error";
import type { LayoutDocumentService } from "../documents/ports";
import { validateSpec } from "../documents";
import {
  type AutomergeSpecDoc,
  applyLocalSpecToDraft,
  automergeDocToSpec,
  specToAutomergeDoc,
} from "./automerge-spec";
import { awaitCollabDocHandle } from "./await-collab-doc-handle";
import { createCollabAutomergeChunkStore } from "./collab-automerge-chunk-store";
import { onCollabRelayMessage, publishCollabRelay } from "./collab-redis-relay";
import { resolveLayoutCollabDocumentId } from "./layout-collab-document-id";
import { PostgresAutomergeStorageAdapter } from "./postgres-automerge-storage";
import {
  type CollabAgentTaskServerMessage,
  type CollabPeerPresence,
  type CollabPresenceClientMessage,
  collabPeersForRecipient,
  serializeCollabAgentTaskServerMessage,
  serializeCollabPresenceServerMessage,
} from "./presence";
import { LayoutCollabNetworkAdapter } from "./repo-network-hub";

const SNAPSHOT_DEBOUNCE_MS = 5_000;
const WS_OPEN = 1;

/**
 * Cross-replica relay kind for layout Automerge snapshots. Automerge merges are commutative and
 * idempotent, so â€” unlike the layout room's own peer-to-peer sync protocol (join/peer handshake
 * over `LayoutCollabNetworkAdapter`) â€” replicas don't need to negotiate a peer session with each
 * other at all: each replica just publishes its full local `Automerge.save()` snapshot on every
 * local change, and any other replica with local peers for that room merges it straight in.
 * Merging an already-known snapshot is a no-op (no new ops to apply), so this naturally
 * terminates instead of ping-ponging once replicas converge.
 */
const RELAY_KIND_LAYOUT_SNAPSHOT = "layout-snapshot";

function isCollabSocketOpen(ws: WSContext): boolean {
  const raw = ws.raw;
  if (!raw || typeof raw !== "object") return false;
  return (raw as { readyState?: number }).readyState === WS_OPEN;
}

function pruneDeadPeers(room: Room): boolean {
  let removed = false;
  for (const [peerId, meta] of room.peerMeta) {
    if (isCollabSocketOpen(meta.ws)) continue;
    room.peerMeta.delete(peerId);
    room.network.unregisterSocket(meta.ws);
    removed = true;
  }
  return removed;
}

type PeerMeta = {
  peerId: string;
  userId: string;
  ws: WSContext;
  peerKind: "human" | "agent";
  displayName: string | null;
  selectedElementId: string | null;
  cursorX: number | null;
  cursorY: number | null;
};

type Room = {
  orgId: string;
  layoutDocumentId: string;
  documentId: string;
  repo: Repo;
  network: LayoutCollabNetworkAdapter;
  handle: DocHandle<Record<string, unknown>>;
  peerMeta: Map<string, PeerMeta>;
  persistTimer: ReturnType<typeof setTimeout> | null;
  persisting: boolean;
  /** Last spec known to match Postgres; detects external HTTP writes (e.g. agent). */
  baselineSpec: Record<string, unknown>;
  reimporting: boolean;
  /** True while merging a snapshot relayed from another replica â€” suppresses re-publishing it. */
  applyingRelay: boolean;
};

function cloneSpec(spec: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(spec)) as Record<string, unknown>;
}

function reimportRoomSpecFromDb(room: Room, dbSpec: Record<string, unknown>): void {
  validateSpec(dbSpec);
  const prev = automergeDocToSpec(room.handle.doc() as AutomergeSpecDoc);
  room.reimporting = true;
  try {
    room.handle.change((draft) => {
      applyLocalSpecToDraft(draft as AutomergeSpecDoc, prev, dbSpec);
    });
  } finally {
    room.reimporting = false;
  }
}

export type LayoutCollabRoomManagerDeps = {
  layout: LayoutDocumentService;
  db: Database;
};

export function createLayoutCollabRoomManager(deps: LayoutCollabRoomManagerDeps) {
  const rooms = new Map<string, Room>();
  const roomLoads = new Map<string, Promise<Room>>();

  function roomKey(orgId: string, layoutDocumentId: string): string {
    return `${orgId}:${layoutDocumentId}`;
  }

  function schedulePersist(room: Room): void {
    if (room.persistTimer) clearTimeout(room.persistTimer);
    room.persistTimer = setTimeout(() => {
      room.persistTimer = null;
      void persistRoom(room);
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  async function persistRoom(room: Room): Promise<void> {
    if (room.persisting || room.reimporting) return;
    room.persisting = true;
    try {
      const collabSpec = automergeDocToSpec(room.handle.doc() as AutomergeSpecDoc);
      validateSpec(collabSpec);

      const collabJson = JSON.stringify(collabSpec);
      const baselineJson = JSON.stringify(room.baselineSpec);

      if (collabJson === baselineJson) {
        const row = await deps.layout.get(room.orgId, room.layoutDocumentId);
        if (!row) return;
        const dbSpec = (row.data.spec ?? { root: "", elements: {} }) as Record<string, unknown>;
        validateSpec(dbSpec);
        const dbJson = JSON.stringify(dbSpec);
        if (dbJson !== baselineJson) {
          // Agent or other HTTP writer updated Postgres while collab doc stayed stale.
          reimportRoomSpecFromDb(room, dbSpec);
          room.baselineSpec = cloneSpec(dbSpec);
        }
        return;
      }

      await deps.layout.update(room.orgId, room.layoutDocumentId, { spec: collabSpec });
      room.baselineSpec = cloneSpec(collabSpec);
    } catch (err) {
      console.error("[collab] snapshot persist failed", err);
    } finally {
      room.persisting = false;
    }
  }

  async function getRoomSpec(
    orgId: string,
    layoutDocumentId: string,
  ): Promise<Record<string, unknown>> {
    const room = await loadRoom(orgId, layoutDocumentId);
    return automergeDocToSpec(room.handle.doc() as AutomergeSpecDoc);
  }

  async function applySpecToRoom(
    orgId: string,
    layoutDocumentId: string,
    next: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const room = await loadRoom(orgId, layoutDocumentId);
    const prev = automergeDocToSpec(room.handle.doc() as AutomergeSpecDoc);
    validateSpec(next);
    room.handle.change((draft) => {
      applyLocalSpecToDraft(draft as AutomergeSpecDoc, prev, next);
    });
    return next;
  }

  async function flushPersist(orgId: string, layoutDocumentId: string): Promise<void> {
    const room = rooms.get(roomKey(orgId, layoutDocumentId));
    if (!room) {
      await persistRoom(await loadRoom(orgId, layoutDocumentId));
      return;
    }
    if (room.persistTimer) {
      clearTimeout(room.persistTimer);
      room.persistTimer = null;
    }
    await persistRoom(room);
  }

  async function syncFromDatabase(orgId: string, layoutDocumentId: string): Promise<void> {
    const room = rooms.get(roomKey(orgId, layoutDocumentId));
    if (!room) return;

    const row = await deps.layout.get(orgId, layoutDocumentId);
    if (!row) return;

    const dbSpec = (row.data.spec ?? { root: "", elements: {} }) as Record<string, unknown>;
    validateSpec(dbSpec);
    const dbJson = JSON.stringify(dbSpec);
    const collabSpec = automergeDocToSpec(room.handle.doc() as AutomergeSpecDoc);
    if (JSON.stringify(collabSpec) === dbJson) {
      room.baselineSpec = cloneSpec(dbSpec);
      return;
    }

    reimportRoomSpecFromDb(room, dbSpec);
    room.baselineSpec = cloneSpec(dbSpec);
  }

  async function loadRoom(orgId: string, layoutDocumentId: string): Promise<Room> {
    const key = roomKey(orgId, layoutDocumentId);
    const existing = rooms.get(key);
    if (existing) return existing;
    const inflight = roomLoads.get(key);
    if (inflight) return inflight;
    const promise = createRoom(orgId, layoutDocumentId, key).finally(() => {
      roomLoads.delete(key);
    });
    roomLoads.set(key, promise);
    return promise;
  }

  async function createRoom(orgId: string, layoutDocumentId: string, key: string): Promise<Room> {
    const row = await deps.layout.get(orgId, layoutDocumentId);
    if (!row) {
      throw new NotFoundError("Layout", layoutDocumentId);
    }
    const spec = (row.data.spec ?? { root: "", elements: {} }) as Record<string, unknown>;
    validateSpec(spec);

    const network = new LayoutCollabNetworkAdapter();
    const serverPeerId = `layout-server:${key}` as PeerId;
    const chunkStore = createCollabAutomergeChunkStore(deps.db);
    const repo = new Repo({
      network: [network],
      peerId: serverPeerId,
      storage: new PostgresAutomergeStorageAdapter(chunkStore, orgId, layoutDocumentId),
    });

    const documentId = resolveLayoutCollabDocumentId(layoutDocumentId);
    let handle = await awaitCollabDocHandle<Record<string, unknown>>(repo, documentId);
    if (!handle.isReady()) {
      const binary = Automerge.save(specToAutomergeDoc(spec));
      handle = repo.import<Record<string, unknown>>(binary, { docId: documentId });
    }

    const room: Room = {
      orgId,
      layoutDocumentId,
      documentId,
      repo,
      network,
      handle,
      peerMeta: new Map(),
      persistTimer: null,
      persisting: false,
      baselineSpec: cloneSpec(spec),
      reimporting: false,
      applyingRelay: false,
    };

    handle.on("change", () => {
      if (room.reimporting) return;
      schedulePersist(room);
      if (!room.applyingRelay) {
        publishCollabRelay(RELAY_KIND_LAYOUT_SNAPSHOT, key, Automerge.save(room.handle.doc()));
      }
    });

    rooms.set(key, room);
    return room;
  }

  // Registered once per process â€” merges layout snapshots relayed from other replicas into this
  // replica's local room, if one exists (no local room means no local peers to relay to; that
  // replica's own room already has the change and will persist it on its own debounce timer).
  onCollabRelayMessage(RELAY_KIND_LAYOUT_SNAPSHOT, ({ roomName, data }) => {
    const room = rooms.get(roomName);
    if (!room || room.reimporting) return;
    room.applyingRelay = true;
    try {
      room.handle.update((doc) => Automerge.merge(doc, Automerge.load(data)) as typeof doc);
    } catch (err) {
      console.error("[collab] layout relay merge failed", err);
    } finally {
      room.applyingRelay = false;
    }
  });

  function pruneInvalidHumanPeers(room: Room): boolean {
    let removed = false;
    for (const [peerId, meta] of room.peerMeta) {
      if (meta.peerKind !== "human" || meta.displayName?.trim()) continue;
      room.peerMeta.delete(peerId);
      room.network.unregisterSocket(meta.ws);
      try {
        meta.ws.close(4000, "invalid peer");
      } catch {
        // Socket may already be closed.
      }
      removed = true;
    }
    return removed;
  }

  function presenceSnapshot(room: Room): CollabPeerPresence[] {
    pruneDeadPeers(room);
    pruneInvalidHumanPeers(room);
    return [...room.peerMeta.values()].map((meta) => ({
      peerId: meta.peerId,
      userId: meta.userId,
      peerKind: meta.peerKind,
      displayName: meta.displayName,
      selectedElementId: meta.selectedElementId,
      cursorX: meta.cursorX,
      cursorY: meta.cursorY,
    }));
  }

  function sendPresenceSync(room: Room, peerId: string, ws: WSContext): void {
    const recipient = room.peerMeta.get(peerId);
    if (!recipient) return;
    try {
      ws.send(
        serializeCollabPresenceServerMessage({
          type: "presence-sync",
          selfPeerId: peerId,
          peers: collabPeersForRecipient(presenceSnapshot(room), recipient),
        }),
      );
    } catch {
      room.peerMeta.delete(peerId);
    }
  }

  function broadcastAgentTask(
    orgId: string,
    layoutDocumentId: string,
    message: CollabAgentTaskServerMessage,
  ): void {
    const room = rooms.get(roomKey(orgId, layoutDocumentId));
    if (!room) return;
    const raw = serializeCollabAgentTaskServerMessage(message);
    for (const meta of room.peerMeta.values()) {
      if (!isCollabSocketOpen(meta.ws)) continue;
      try {
        meta.ws.send(raw);
      } catch {
        // Peer may have disconnected mid-broadcast.
      }
    }
  }

  function broadcastPresenceSync(room: Room): void {
    if (pruneDeadPeers(room)) {
      if (room.peerMeta.size === 0) return;
    }
    pruneInvalidHumanPeers(room);
    for (const [peerId, meta] of room.peerMeta) {
      if (!isCollabSocketOpen(meta.ws)) continue;
      sendPresenceSync(room, peerId, meta.ws);
    }
  }

  /** Drop closed human/agent sockets for the same user â€” live tabs stay connected. */
  function evictDeadPeersForUser(
    room: Room,
    userId: string,
    keepPeerId: string,
    peerKind: "human" | "agent",
  ): void {
    for (const [existingPeerId, meta] of room.peerMeta) {
      if (existingPeerId === keepPeerId || meta.userId !== userId || meta.peerKind !== peerKind) {
        continue;
      }
      if (isCollabSocketOpen(meta.ws)) continue;
      room.peerMeta.delete(existingPeerId);
      room.network.unregisterSocket(meta.ws);
    }
  }

  function evictStalePeersForUser(
    room: Room,
    userId: string,
    keepPeerId: string,
    peerKind: "human" | "agent",
  ): boolean {
    let removed = false;
    for (const [existingPeerId, meta] of room.peerMeta) {
      if (existingPeerId === keepPeerId || meta.userId !== userId || meta.peerKind !== peerKind) {
        continue;
      }
      room.peerMeta.delete(existingPeerId);
      room.network.unregisterSocket(meta.ws);
      try {
        meta.ws.close(4000, "replaced");
      } catch {
        // Socket may already be closed.
      }
      removed = true;
    }
    return removed;
  }

  async function joinPeer(input: {
    orgId: string;
    layoutDocumentId: string;
    userId: string;
    peerId: string;
    ws: WSContext;
    peerKind?: "human" | "agent";
    displayName?: string | null;
  }): Promise<void> {
    const room = await loadRoom(input.orgId, input.layoutDocumentId);
    const peerKind = input.peerKind ?? "human";
    const displayName = input.displayName?.trim() || null;
    if (!displayName) {
      throw new ValidationError("displayName", "collab peer requires displayName");
    }
    if (peerKind === "agent") {
      evictStalePeersForUser(room, input.userId, input.peerId, peerKind);
    } else {
      evictDeadPeersForUser(room, input.userId, input.peerId, peerKind);
    }
    room.peerMeta.set(input.peerId, {
      peerId: input.peerId,
      userId: input.userId,
      ws: input.ws,
      peerKind,
      displayName,
      selectedElementId: null,
      cursorX: null,
      cursorY: null,
    });
    sendPresenceSync(room, input.peerId, input.ws);
    broadcastPresenceSync(room);
  }

  function leavePeer(orgId: string, layoutDocumentId: string, peerId: string, ws: WSContext): void {
    const room = rooms.get(roomKey(orgId, layoutDocumentId));
    if (!room) return;

    room.network.unregisterSocket(ws);
    room.peerMeta.delete(peerId);

    if (room.peerMeta.size === 0) {
      void persistRoom(room);
      void room.repo.shutdown();
      rooms.delete(roomKey(orgId, layoutDocumentId));
      return;
    }
    broadcastPresenceSync(room);
  }

  function handlePresenceMessage(
    orgId: string,
    layoutDocumentId: string,
    peerId: string,
    message: CollabPresenceClientMessage,
  ): void {
    const room = rooms.get(roomKey(orgId, layoutDocumentId));
    if (!room) return;
    const meta = room.peerMeta.get(peerId);
    if (!meta) return;

    if (message.displayName !== undefined) {
      const trimmed = typeof message.displayName === "string" ? message.displayName.trim() : "";
      if (trimmed) {
        meta.displayName = trimmed;
      }
    }
    if (message.peerKind !== undefined && message.peerKind !== meta.peerKind) {
      const nextKind = message.peerKind;
      const name = meta.displayName?.trim();
      if (name || nextKind !== "human") {
        meta.peerKind = nextKind;
      }
    }
    if (message.selectedElementId !== undefined) {
      meta.selectedElementId = message.selectedElementId;
    }
    if (message.cursorX !== undefined) {
      meta.cursorX = message.cursorX;
    }
    if (message.cursorY !== undefined) {
      meta.cursorY = message.cursorY;
    }
    if (meta.peerKind === "agent") {
      evictStalePeersForUser(room, meta.userId, peerId, "agent");
    } else if (meta.peerKind === "human") {
      evictDeadPeersForUser(room, meta.userId, peerId, "human");
    }
    pruneInvalidHumanPeers(room);
    broadcastPresenceSync(room);
  }

  function handleRepoMessage(
    orgId: string,
    layoutDocumentId: string,
    _peerId: string,
    data: Uint8Array,
    ws: WSContext,
  ): void {
    void loadRoom(orgId, layoutDocumentId)
      .then((room) => {
        room.network.receiveMessage(data, ws);
      })
      .catch((err) => {
        console.error("[collab] repo message failed", err);
        ws.close(4500, "room unavailable");
      });
  }

  return {
    joinPeer,
    leavePeer,
    handleRepoMessage,
    handlePresenceMessage,
    getSpec: getRoomSpec,
    applySpec: applySpecToRoom,
    flushPersist,
    syncFromDatabase,
    broadcastAgentTask,
  };
}

export type LayoutCollabRoomManager = ReturnType<typeof createLayoutCollabRoomManager>;
