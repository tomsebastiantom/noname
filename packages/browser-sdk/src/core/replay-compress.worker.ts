import { gzipSync } from "fflate";

type CompressRequest = { id: number; json: string };
type CompressResponse = { id: number; compressed: Uint8Array };

self.onmessage = (event: MessageEvent<CompressRequest>) => {
  const { id, json } = event.data;
  const compressed = gzipSync(new TextEncoder().encode(json));
  const response: CompressResponse = { id, compressed };
  self.postMessage(response, { transfer: [compressed.buffer] });
};
