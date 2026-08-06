import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import WebSocket from "isomorphic-ws";

/** Node WS client — same dual JSON presence + CBOR repo protocol as the browser adapter. */
export class LayoutCollabWsClient extends WebSocketClientAdapter {
  onPresenceMessage: ((raw: string) => void) | null = null;
  onConnectionChange: ((connected: boolean) => void) | null = null;

  constructor(url: string) {
    super(url);
    const parentOnOpen = this.onOpen;
    this.onOpen = () => {
      parentOnOpen.call(this);
      this.onConnectionChange?.(true);
    };
    const parentOnClose = this.onClose;
    this.onClose = () => {
      parentOnClose.call(this);
      this.onConnectionChange?.(false);
    };
  }

  onMessage = (event: WebSocket.MessageEvent) => {
    if (typeof event.data === "string") {
      this.onPresenceMessage?.(event.data);
      return;
    }
    const data = event.data;
    if (data instanceof ArrayBuffer) {
      this.receiveMessage(new Uint8Array(data));
      return;
    }
    if (ArrayBuffer.isView(data)) {
      const view = data as ArrayBufferView;
      this.receiveMessage(
        new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength)),
      );
    }
  };

  sendPresence(raw: string): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(raw);
    }
  }

  /** automerge-repo asserts peerId+socket; repo.shutdown can clear them first. */
  disconnect(): void {
    if (!this.peerId || !this.socket) return;
    try {
      super.disconnect();
    } catch (err) {
      console.error("[agent-collab] layout ws disconnect failed", err);
    }
  }
}

export function layoutCollabWsUrl(port: number, ticket: string): string {
  return `ws://127.0.0.1:${port}/api/collab/layout/ws?collab_ticket=${encodeURIComponent(ticket)}`;
}
