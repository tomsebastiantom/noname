import {
  cbor,
  isRepoMessage,
  type Message,
  NetworkAdapter,
  type PeerId,
  type PeerMetadata,
} from "@automerge/automerge-repo/slim";
import {
  type FromClientMessage,
  type JoinMessage,
  ProtocolV1,
} from "@automerge/automerge-repo-network-websocket";
import type { WSContext } from "hono/ws";

function isJoinMessage(message: FromClientMessage): message is JoinMessage {
  return message.type === "join";
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const { buffer, byteOffset, byteLength } = bytes;
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer;
}

function selectProtocol(versions: readonly string[] | undefined): string | null {
  if (versions === undefined) return ProtocolV1;
  if (versions.includes(ProtocolV1)) return ProtocolV1;
  return null;
}

/** automerge-repo network hub for one layout room (server-side peer). */
export class LayoutCollabNetworkAdapter extends NetworkAdapter {
  private sockets = new Map<PeerId, WSContext>();
  private socketByPeer = new Map<WSContext, PeerId>();
  private ready = false;
  private readyResolver!: () => void;
  private readonly readyPromise = new Promise<void>((resolve) => {
    this.readyResolver = resolve;
  });

  isReady(): boolean {
    return this.ready;
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  connect(peerId: PeerId, peerMetadata?: PeerMetadata): void {
    this.peerId = peerId;
    this.peerMetadata = peerMetadata ?? {};
    this.ready = true;
    this.readyResolver();
  }

  disconnect(): void {
    for (const peerId of [...this.sockets.keys()]) {
      this.unregisterPeer(peerId);
    }
    this.ready = false;
  }

  send(message: Message): void {
    if (!("targetId" in message) || message.targetId === undefined) return;
    if ("data" in message && message.data?.byteLength === 0) return;

    const socket = this.sockets.get(message.targetId);
    if (!socket) return;

    const encoded = cbor.encode(message);
    socket.send(toArrayBuffer(encoded));
  }

  receiveMessage(messageBytes: Uint8Array, ws: WSContext): void {
    let message: FromClientMessage;
    try {
      message = cbor.decode(messageBytes) as FromClientMessage;
    } catch {
      ws.close(4400, "invalid repo message");
      return;
    }

    const myPeerId = this.peerId;
    if (!myPeerId) return;

    if (isJoinMessage(message)) {
      const { senderId, peerMetadata, supportedProtocolVersions } = message;
      const existing = this.sockets.get(senderId);
      if (existing && existing !== ws) {
        try {
          existing.close(4000, "replaced");
        } catch {
          // ignore
        }
        this.unregisterPeer(senderId);
      }

      this.sockets.set(senderId, ws);
      this.socketByPeer.set(ws, senderId);
      this.emit("peer-candidate", { peerId: senderId, peerMetadata });

      const selectedProtocolVersion = selectProtocol(supportedProtocolVersions);
      if (selectedProtocolVersion === null) {
        this.send({
          type: "error",
          senderId: myPeerId,
          message: "unsupported protocol version",
          targetId: senderId,
        } as Message);
        this.unregisterPeer(senderId);
        return;
      }

      this.send({
        type: "peer",
        senderId: myPeerId,
        peerMetadata: this.peerMetadata ?? {},
        selectedProtocolVersion: ProtocolV1,
        targetId: senderId,
      } as Message);
      return;
    }

    const senderId = message.senderId;
    if (this.sockets.get(senderId) !== ws) return;
    if (isRepoMessage(message)) {
      this.emit("message", message);
    }
  }

  forEachSocket(callback: (peerId: PeerId, ws: WSContext) => void): void {
    for (const [peerId, ws] of this.sockets) {
      callback(peerId, ws);
    }
  }

  connectedPeerCount(): number {
    return this.sockets.size;
  }

  unregisterSocket(ws: WSContext): void {
    const peerId = this.socketByPeer.get(ws);
    if (!peerId) return;
    this.unregisterPeer(peerId);
  }

  private unregisterPeer(peerId: PeerId): void {
    const socket = this.sockets.get(peerId);
    if (socket) {
      this.socketByPeer.delete(socket);
    }
    if (this.sockets.delete(peerId)) {
      this.emit("peer-disconnected", { peerId });
    }
  }
}
