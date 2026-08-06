function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function sendAutomergeBytes(ws: WebSocket, bytes: Uint8Array): void {
  ws.send(toArrayBuffer(bytes));
}
