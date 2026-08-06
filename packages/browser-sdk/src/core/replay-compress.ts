import { gzipSync } from "fflate";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<
  number,
  { resolve: (v: Uint8Array) => void; reject: (err: Error) => void }
>();

function gzipSyncMain(json: string): Uint8Array {
  return gzipSync(new TextEncoder().encode(json));
}

function canUseModuleWorker(): boolean {
  try {
    return typeof import.meta !== "undefined" && typeof import.meta.url === "string";
  } catch {
    return false;
  }
}

function getWorker(): Worker | null {
  if (typeof Worker === "undefined" || !canUseModuleWorker()) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./replay-compress.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<{ id: number; compressed: Uint8Array }>) => {
      const { id, compressed } = event.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      entry.resolve(compressed);
    };
    worker.onerror = () => {
      worker = null;
      for (const [, entry] of pending) {
        entry.reject(new Error("replay compress worker failed"));
      }
      pending.clear();
    };
    return worker;
  } catch {
    return null;
  }
}

/** Gzip a replay POST payload (rrweb chunk envelope). Uses a Web Worker when available. */
export function gzipReplayPayload(payload: unknown): Promise<Uint8Array> {
  const json = JSON.stringify(payload);
  const w = getWorker();
  if (!w) {
    return Promise.resolve(gzipSyncMain(json));
  }

  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, json });
    setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      resolve(gzipSyncMain(json));
    }, 3000);
  });
}
