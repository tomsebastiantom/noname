import { WebSocketClientAdapter } from "@automerge/automerge-repo-network-websocket";
import WebSocket from "isomorphic-ws";

/** WebSocket client adapter that also forwards JSON presence frames on the same socket. */
export class LayoutCollabWsAdapter extends WebSocketClientAdapter {
  onPresenceMessage: ((raw: string) => void) | null = null;
  /** Fired when the socket opens (true) or closes (false). Close code/reason when available. */
  onConnectionChange:
    | ((connected: boolean, close?: { code: number; reason: string }) => void)
    | null = null;

  constructor(url: string) {
    super(url);
    const parentOnOpen = this.onOpen;
    this.onOpen = () => {
      parentOnOpen.call(this);
      this.onConnectionChange?.(true);
    };
    const parentOnClose = this.onClose;
    this.onClose = (event?: CloseEvent) => {
      parentOnClose.call(this);
      const code = event?.code ?? 0;
      const reason = event?.reason ?? "";
      this.onConnectionChange?.(false, { code, reason });
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

  /** automerge-repo asserts peerId+socket before closing; skip if never connected. */
  disconnect(): void {
    if (!this.peerId || !this.socket) return;
    try {
      super.disconnect();
    } catch (err) {
      console.error("[layout-collab-ws] disconnect failed", err);
    }
  }
}
