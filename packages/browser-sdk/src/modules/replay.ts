import { onUnload } from "../core/lifecycle";
import { sendBeacon } from "../core/transport";
import type { ReplayModule } from "../types";

const RING_BUFFER_MS = 60_000;
const FULL_SNAPSHOT_BYTES = 10_000_000;
const FULL_SNAPSHOT_MS = 4 * 60 * 1000;

export async function createReplayModule(
  endpoint: string,
  sessionId: string,
  sampleRate: number,
  maskAllInputs: boolean,
  maxDurationMs: number,
): Promise<ReplayModule> {
  if (typeof window === "undefined") {
    return noopModule();
  }

  if (Math.random() >= sampleRate) {
    return noopModule();
  }

  const rrweb = await import("rrweb");
  const maskSelectors = new Set<string>();
  let recording = false;
  let stopFn: (() => void) | null = null;
  let buffer: unknown[] = [];
  let bytesSinceFullSnapshot = 0;
  let timeSinceFullSnapshot = Date.now();
  let lastFlushTime = Date.now();
  let hasRecordedFirstEvent = false;

  function takeFullSnapshot() {
    if (!recording || !stopFn) return;
    try {
      if (
        rrweb.record &&
        typeof (rrweb.record as { takeFullSnapshot?: () => void }).takeFullSnapshot === "function"
      ) {
        (rrweb.record as { takeFullSnapshot: () => void }).takeFullSnapshot();
      }
    } catch {
      // rrweb throws if called before its initial full snapshot completes.
    }
    bytesSinceFullSnapshot = 0;
    timeSinceFullSnapshot = Date.now();
  }

  function flush() {
    if (buffer.length === 0) return;
    const chunk = buffer;
    buffer = [];
    sendBeacon(
      endpoint,
      JSON.stringify({
        sessionId,
        timestamp: Date.now(),
        events: chunk,
      }),
    );
    lastFlushTime = Date.now();
  }

  onUnload(() => flush());

  function startRecording() {
    if (stopFn || recording) return;

    timeSinceFullSnapshot = Date.now();
    bytesSinceFullSnapshot = 0;
    hasRecordedFirstEvent = false;

    const handler = rrweb.record({
      emit(event) {
        buffer.push(event);
        lastFlushTime = Date.now();

        const size = JSON.stringify(event).length;
        bytesSinceFullSnapshot += size;

        if (!hasRecordedFirstEvent) {
          hasRecordedFirstEvent = true;
          timeSinceFullSnapshot = Date.now();
          bytesSinceFullSnapshot = size;
        } else if (
          bytesSinceFullSnapshot > FULL_SNAPSHOT_BYTES ||
          Date.now() - timeSinceFullSnapshot > FULL_SNAPSHOT_MS
        ) {
          takeFullSnapshot();
        }

        // Prune events older than ring buffer window
        const cutoff = Date.now() - RING_BUFFER_MS;
        buffer = buffer.filter((e: any) => (e.timestamp ?? 0) > cutoff);

        if (Date.now() - lastFlushTime > maxDurationMs) {
          flush();
        }
      },

      maskAllInputs,
      maskInputOptions: maskAllInputs ? { password: true } : undefined,
      blockClass: "noname-block",
      ignoreClass: "noname-ignore",
      maskTextClass: "noname-mask",
    });

    stopFn = handler ?? null;
    recording = true;
  }

  const mod: ReplayModule = {
    start() {
      startRecording();
    },

    stop() {
      if (stopFn) {
        stopFn();
        stopFn = null;
        flush();
      }
      recording = false;
    },

    mask(selector) {
      maskSelectors.add(selector);
      if (typeof document !== "undefined") {
        for (const el of document.querySelectorAll(selector)) {
          el.classList.add("noname-mask");
        }
      }
    },

    unmask(selector) {
      maskSelectors.delete(selector);
    },

    getSessionId() {
      return sessionId;
    },
  };

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        mod.stop();
      } else if (sampleRate === 1 || Math.random() < sampleRate) {
        mod.start();
      }
    });
  }

  startRecording();
  return mod;
}

function noopModule(): ReplayModule {
  return {
    start() {},
    stop() {},
    mask() {},
    unmask() {},
    getSessionId() {
      return "";
    },
  };
}
