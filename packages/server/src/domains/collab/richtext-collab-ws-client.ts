import WebSocket from "isomorphic-ws";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

const messageSync = 0;
const messageAwareness = 1;

export function richTextCollabWsUrl(port: number, roomName: string, ticket: string): string {
  return `ws://127.0.0.1:${port}/api/collab/richtext/ws/${encodeURIComponent(roomName)}?collab_ticket=${encodeURIComponent(ticket)}`;
}

/** Node Yjs client for the same binary protocol as `createRichTextYjsRoomManager`. */
export class RichTextCollabWsClient {
  readonly doc: Y.Doc;
  readonly awareness: awarenessProtocol.Awareness;
  private ws: WebSocket | null = null;
  private url: string;
  private readonly origin = {};
  private synced = false;
  private syncWaiters: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

  constructor(url: string, existingDoc?: Y.Doc) {
    this.url = url;
    this.doc = existingDoc ?? new Y.Doc();
    this.awareness = new awarenessProtocol.Awareness(this.doc);

    this.doc.on("update", (update: Uint8Array, origin: unknown) => {
      if (origin === this.origin) return;
      this.sendSyncUpdate(update);
    });

    this.awareness.on(
      "update",
      (
        { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown,
      ) => {
        if (origin === this.origin) return;
        const changed = added.concat(updated, removed);
        if (changed.length === 0) return;
        this.sendAwareness(changed);
      },
    );
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async connect(): Promise<void> {
    if (this.isConnected()) return;
    await this.openSocket(this.url);
  }

  async reconnect(url: string): Promise<void> {
    this.url = url;
    this.resetSync();
    this.closeConnection();
    await this.openSocket(url);
  }

  async whenSynced(timeoutMs = 8_000): Promise<void> {
    if (this.synced) return;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.syncWaiters = this.syncWaiters.filter((entry) => entry.resolve !== resolve);
        reject(new Error("Rich text Yjs sync timeout"));
      }, timeoutMs);
      this.syncWaiters.push({
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
    });
  }

  closeConnection(): void {
    if (!this.ws) return;
    try {
      this.ws.close();
    } catch {
      // ignore
    }
    this.ws = null;
  }

  destroy(): void {
    this.closeConnection();
    this.rejectSyncWaiters(new Error("Rich text collab client destroyed"));
    this.awareness.destroy();
    this.doc.destroy();
  }

  setAwarenessUser(user: { name: string; color: string }): void {
    // y-protocols' setLocalState takes only the state — there is no origin parameter.
    this.awareness.setLocalState({ user });
  }

  pulseAwareness(): void {
    const state = this.awareness.getLocalState();
    if (!state) return;
    this.awareness.setLocalState({ ...state, activeAt: Date.now() });
  }

  private async openSocket(url: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(url);
      this.ws = ws;
      ws.binaryType = "arraybuffer";

      ws.onopen = () => resolve();
      ws.onerror = () => reject(new Error("Rich text collab connection failed"));
      ws.onmessage = (event) => this.handleMessage(event.data);
      ws.onclose = () => {
        if (this.ws === ws) this.ws = null;
      };
    });
  }

  private resetSync(): void {
    this.synced = false;
  }

  private markSynced(): void {
    if (this.synced) return;
    this.synced = true;
    for (const waiter of this.syncWaiters) {
      waiter.resolve();
    }
    this.syncWaiters = [];
  }

  private rejectSyncWaiters(err: Error): void {
    for (const waiter of this.syncWaiters) {
      waiter.reject(err);
    }
    this.syncWaiters = [];
  }

  private sendSyncUpdate(update: Uint8Array): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageSync);
    syncProtocol.writeUpdate(encoder, update);
    ws.send(encoding.toUint8Array(encoder));
  }

  private sendAwareness(changedClients: number[]): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, messageAwareness);
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients),
    );
    ws.send(encoding.toUint8Array(encoder));
  }

  private handleMessage(data: unknown): void {
    const bytes = readBinaryMessage(data);
    if (!bytes) return;

    const decoder = decoding.createDecoder(bytes);
    const messageType = decoding.readVarUint(decoder);
    switch (messageType) {
      case messageSync: {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, this.doc, this.origin);
        if (encoding.length(encoder) > 1 && this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(encoding.toUint8Array(encoder));
        }
        this.markSynced();
        break;
      }
      case messageAwareness:
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          this.origin,
        );
        break;
      default:
        break;
    }
  }
}

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
