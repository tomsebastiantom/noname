import type { WSContext } from "hono/ws";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { createRichTextYjsRoomManager } from "./richtext-yjs-room";

const relayHandlers = new Map<
  string,
  Array<(msg: { roomName: string; data: Uint8Array }) => void>
>();

vi.mock("./collab-redis-relay", () => ({
  onCollabRelayMessage: (
    kind: string,
    handler: (msg: { roomName: string; data: Uint8Array }) => void,
  ) => {
    const existing = relayHandlers.get(kind) ?? [];
    existing.push(handler);
    relayHandlers.set(kind, existing);
  },
  publishCollabRelay: vi.fn(),
}));

const ROOM_NAME = "org1:doc1:body:en-US";

function fakeWs(): WSContext {
  const messages: Uint8Array[] = [];
  return {
    raw: {},
    send: (data: unknown) => {
      messages.push(new Uint8Array(data as ArrayBuffer));
    },
    // exposed for assertions in tests below
    __messages: messages,
  } as unknown as WSContext & { __messages: Uint8Array[] };
}

function extractDocUpdateFromSyncMessage(bytes: Uint8Array): Uint8Array | null {
  const decoder = decoding.createDecoder(bytes);
  const messageType = decoding.readVarUint(decoder);
  if (messageType !== 0) return null;
  // syncMessageType 2 == update; readSyncMessage would apply it to a doc, so read manually.
  const syncMessageType = decoding.readVarUint(decoder);
  if (syncMessageType !== 2) return null;
  return decoding.readVarUint8Array(decoder);
}

describe("createRichTextYjsRoomManager — cross-replica relay", () => {
  beforeEach(() => {
    relayHandlers.clear();
    vi.clearAllMocks();
  });

  it("publishes local doc updates to the relay, tagged with the room name", async () => {
    const { publishCollabRelay } = await import("./collab-redis-relay");
    const manager = createRichTextYjsRoomManager({
      content: { updateById: vi.fn() },
      storage: { findDocumentById: vi.fn().mockResolvedValue(null) },
    });

    const ws = fakeWs();
    manager.joinPeer(ROOM_NAME, ws);

    // Simulate a client sync-step-2 update message so the room's Y.Doc actually changes.
    const localDoc = new Y.Doc();
    localDoc.getText("body").insert(0, "hello");
    const update = Y.encodeStateAsUpdate(localDoc);
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0); // messageSync
    syncProtocol.writeUpdate(encoder, update);
    manager.handleMessage(ROOM_NAME, ws, toArrayBuffer(encoding.toUint8Array(encoder)));

    expect(publishCollabRelay).toHaveBeenCalledWith("richtext-doc", ROOM_NAME, expect.anything());
  });

  it("applies a relayed doc update to the local room and forwards it to local peers", async () => {
    const manager = createRichTextYjsRoomManager({
      content: { updateById: vi.fn() },
      storage: { findDocumentById: vi.fn().mockResolvedValue(null) },
    });

    const ws = fakeWs() as WSContext & { __messages: Uint8Array[] };
    manager.joinPeer(ROOM_NAME, ws);
    ws.__messages.length = 0; // discard the initial sync-step-1/awareness handshake messages

    // Build a Yjs update from an independent doc, as if it arrived from another replica.
    const remoteDoc = new Y.Doc();
    remoteDoc.getText("body").insert(0, "from another replica");
    const remoteUpdate = Y.encodeStateAsUpdate(remoteDoc);

    const docHandlers = relayHandlers.get("richtext-doc") ?? [];
    expect(docHandlers.length).toBeGreaterThan(0);
    for (const handler of docHandlers) {
      handler({ roomName: ROOM_NAME, data: remoteUpdate });
    }

    // The local peer should have received a sync/update message carrying the relayed content.
    const forwarded = ws.__messages
      .map((bytes) => extractDocUpdateFromSyncMessage(bytes))
      .find((bytes): bytes is Uint8Array => bytes !== null);
    expect(forwarded).toBeDefined();

    const merged = new Y.Doc();
    Y.applyUpdate(merged, forwarded as Uint8Array);
    expect(merged.getText("body").toString()).toBe("from another replica");
  });
});

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
