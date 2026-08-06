function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function sendAutomergeBytes(
  send: (data: string | ArrayBuffer) => void,
  bytes: Uint8Array,
): void {
  send(toArrayBuffer(bytes));
}
