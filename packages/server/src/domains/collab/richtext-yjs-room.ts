import { serializeRichTextFieldValue } from "@noname/documents";
import type { WSContext } from "hono/ws";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { AgentRichTextYjsEditor } from "../agent/collab/agent-richtext-yjs-editor";
import type { ContentDocumentService, DocumentStorage } from "../documents/ports";
import { onCollabRelayMessage, publishCollabRelay } from "./collab-redis-relay";
import { parseRichTextCollabRoomName } from "./richtext-collab-ticket";
import { sendAutomergeBytes } from "./ws-bytes";

const messageSync = 0;
const messageAwareness = 1;
const SNAPSHOT_DEBOUNCE_MS = 5_000;

/** Room kinds registered with the cross-replica relay (see `collab-redis-relay.ts`). */
const RELAY_KIND_DOC = "richtext-doc";
const RELAY_KIND_AWARENESS = "richtext-awareness";

/**
 * Marks a Yjs transaction as originating from another replica (relayed via Redis) rather than a
 * local peer or this process's own snapshot editor — used to avoid re-publishing a message this
 * replica only just received, which would otherwise ping-pong forever between replicas.
 */
const RELAY_ORIGIN = Symbol("collab-relay-origin");

type RoomMeta = {
  orgId: string;
  contentDocumentId: string;
  fieldKey: string;
  locale: string;
};

type YjsRoom = {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  conns: Map<object, WSContext>;
  meta: RoomMeta;
  persistTimer: ReturnType<typeof setTimeout> | null;
  persisting: boolean;
  snapshotEditor: AgentRichTextYjsEditor | null;
};

export type RichTextYjsRoomManagerDeps = {
  content: Pick<ContentDocumentService, "updateById">;
  storage: Pick<DocumentStorage, "findDocumentById">;
};

function readBinaryMessage(data: unknown): Uint8Array | null {
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
  }
  return null;
}

function sendBinary(ws: WSContext, message: Uint8Array): void {
  sendAutomergeBytes((data) => ws.send(data), message);
}

function broadcastRoom(room: YjsRoom, message: Uint8Array, exclude?: object): void {
  for (const [connKey, ws] of room.conns.entries()) {
    if (exclude && connKey === exclude) continue;
    sendBinary(ws, message);
  }
}

function onAwarenessUpdate(
  room: YjsRoom,
  roomName: string,
  { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
  origin: unknown,
): void {
  const changedClients = added.concat(updated, removed);
  if (changedClients.length === 0) return;

  const rawUpdate = awarenessProtocol.encodeAwarenessUpdate(room.awareness, changedClients);
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(encoder, rawUpdate);
  const message = encoding.toUint8Array(encoder);
  broadcastRoom(room, message, origin as object | undefined);
  if (origin !== RELAY_ORIGIN) {
    publishCollabRelay(RELAY_KIND_AWARENESS, roomName, rawUpdate);
  }
}

function handleSyncMessage(room: YjsRoom, ws: WSContext, decoder: decoding.Decoder): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.readSyncMessage(decoder, encoder, room.doc, ws);
  if (encoding.length(encoder) > 1) {
    sendBinary(ws, encoding.toUint8Array(encoder));
  }
}

function sendSyncStep1(room: YjsRoom, ws: WSContext): void {
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageSync);
  syncProtocol.writeSyncStep1(encoder, room.doc);
  sendBinary(ws, encoding.toUint8Array(encoder));
}

function sendAwarenessState(room: YjsRoom, ws: WSContext): void {
  if (room.awareness.getLocalState() === null) return;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, messageAwareness);
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(
      room.awareness,
      Array.from(room.awareness.getStates().keys()),
    ),
  );
  sendBinary(ws, encoding.toUint8Array(encoder));
}

function destroyRoom(room: YjsRoom): void {
  if (room.persistTimer) {
    clearTimeout(room.persistTimer);
    room.persistTimer = null;
  }
  room.snapshotEditor?.destroy();
  room.snapshotEditor = null;
  room.doc.destroy();
}

export function createRichTextYjsRoomManager(deps: RichTextYjsRoomManagerDeps) {
  const rooms = new Map<string, YjsRoom>();

  function schedulePersist(room: YjsRoom): void {
    if (room.persistTimer) clearTimeout(room.persistTimer);
    room.persistTimer = setTimeout(() => {
      room.persistTimer = null;
      void persistRoom(room);
    }, SNAPSHOT_DEBOUNCE_MS);
  }

  async function persistRoom(room: YjsRoom): Promise<void> {
    if (room.persisting) return;
    room.persisting = true;
    try {
      const row = await deps.storage.findDocumentById(room.meta.contentDocumentId);
      if (!row || row.orgId !== room.meta.orgId || row.status !== "draft") return;

      if (!room.snapshotEditor) {
        room.snapshotEditor = new AgentRichTextYjsEditor();
        room.snapshotEditor.bind(room.doc);
      }

      const richTextDoc = room.snapshotEditor.currentDocument();
      const serialized = serializeRichTextFieldValue(richTextDoc);
      await deps.content.updateById(
        row.orgId,
        row.type,
        row.id,
        {
          [room.meta.fieldKey]: serialized,
        },
        { locale: room.meta.locale },
      );
    } catch (err) {
      console.error("[collab] rich text snapshot persist failed", err);
    } finally {
      room.persisting = false;
    }
  }

  function onDocumentUpdate(
    room: YjsRoom,
    roomName: string,
    update: Uint8Array,
    origin: unknown,
  ): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    broadcastRoom(room, message, origin as object | undefined);
    schedulePersist(room);
    if (origin !== RELAY_ORIGIN) {
      publishCollabRelay(RELAY_KIND_DOC, roomName, update);
    }
  }

  function getOrCreateRoom(roomName: string): YjsRoom | null {
    const existing = rooms.get(roomName);
    if (existing) return existing;

    const parsed = parseRichTextCollabRoomName(roomName);
    if (!parsed) return null;

    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    const room: YjsRoom = {
      doc,
      awareness,
      conns: new Map(),
      meta: parsed,
      persistTimer: null,
      persisting: false,
      snapshotEditor: null,
    };

    doc.on("update", (update: Uint8Array, origin: unknown) => {
      onDocumentUpdate(room, roomName, update, origin);
    });
    awareness.on(
      "update",
      (payload: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        onAwarenessUpdate(room, roomName, payload, origin);
      },
    );

    rooms.set(roomName, room);
    return room;
  }

  // Registered once per process — applies messages from other replicas' rooms of the same
  // name to this replica's local room (if one exists; if not, there are no local peers to
  // relay to, so the message is simply dropped — that replica's own room will persist it).
  onCollabRelayMessage(RELAY_KIND_DOC, ({ roomName, data }) => {
    const room = rooms.get(roomName);
    if (!room) return;
    Y.applyUpdate(room.doc, data, RELAY_ORIGIN);
  });
  onCollabRelayMessage(RELAY_KIND_AWARENESS, ({ roomName, data }) => {
    const room = rooms.get(roomName);
    if (!room) return;
    awarenessProtocol.applyAwarenessUpdate(room.awareness, data, RELAY_ORIGIN);
  });

  return {
    joinPeer(roomName: string, ws: WSContext): void {
      const raw = ws.raw;
      if (!raw) return;
      const room = getOrCreateRoom(roomName);
      if (!room) return;
      room.conns.set(raw, ws);
      sendSyncStep1(room, ws);
      sendAwarenessState(room, ws);
    },

    leavePeer(roomName: string, ws: WSContext): void {
      const raw = ws.raw;
      if (!raw) return;
      const room = rooms.get(roomName);
      if (!room) return;
      room.conns.delete(raw);
      awarenessProtocol.removeAwarenessStates(
        room.awareness,
        Array.from(room.awareness.getStates().keys()),
        ws,
      );
      if (room.conns.size === 0) {
        void persistRoom(room).finally(() => {
          destroyRoom(room);
          rooms.delete(roomName);
        });
      }
    },

    handleMessage(roomName: string, ws: WSContext, data: unknown): void {
      const bytes = readBinaryMessage(data);
      if (!bytes) return;
      const room = rooms.get(roomName);
      if (!room) return;
      const raw = ws.raw;
      if (!raw || !room.conns.has(raw)) return;

      const decoder = decoding.createDecoder(bytes);
      const messageType = decoding.readVarUint(decoder);
      switch (messageType) {
        case messageSync:
          handleSyncMessage(room, ws, decoder);
          break;
        case messageAwareness:
          awarenessProtocol.applyAwarenessUpdate(
            room.awareness,
            decoding.readVarUint8Array(decoder),
            ws,
          );
          break;
        default:
          break;
      }
    },
  };
}

export type RichTextYjsRoomManager = ReturnType<typeof createRichTextYjsRoomManager>;
