import type { FlagsModule } from "../types";

type FlagValue = unknown;
type FlagMap = Map<string, FlagValue>;
type Callback = (value: FlagValue) => void;
type ChangeCallback = Array<{ key: string; cb: Callback }>;
type AnyChangeCallback = Array<(key: string, value: FlagValue) => void>;

export function createFlagsModule(
  endpoint: string,
  getContext: () => {
    contextHash: string;
    schemaId: string | null;
    variantId: string | null;
    contextProperties: Record<string, string | number | boolean>;
  },
  getHeaders: () => Record<string, string> = () => ({}),
): FlagsModule {
  const cache: FlagMap = new Map();
  const listeners: ChangeCallback = [];
  const anyListeners: AnyChangeCallback = [];
  let es: EventSource | null = null;
  let ready = false;

  async function evaluate(flagKeys?: string[]): Promise<void> {
    const ctx = getContext();
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getHeaders() },
        body: JSON.stringify({
          context: {
            contextHash: ctx.contextHash,
            schemaId: ctx.schemaId,
            variantId: ctx.variantId,
            contextProperties: ctx.contextProperties,
          },
          flagKeys,
        }),
      });

      if (!res.ok) return;

      const body = (await res.json()) as {
        data?: { evaluations: Array<{ flagKey: string; value: unknown }> };
        evaluations?: Array<{ flagKey: string; value: unknown }>;
      };
      const evaluations = body.data?.evaluations ?? body.evaluations ?? [];
      for (const ev of evaluations) {
        const old = cache.get(ev.flagKey);
        cache.set(ev.flagKey, ev.value);
        if (old !== ev.value) {
          notify(ev.flagKey, ev.value);
        }
      }
    } catch {
      // Flags are best-effort — use cache
    }
  }

  function notify(key: string, value: FlagValue): void {
    for (const listener of listeners) {
      if (listener.key === key) {
        try {
          listener.cb(value);
        } catch {
          // Don't break other listeners
        }
      }
    }
    for (const cb of anyListeners) {
      try {
        cb(key, value);
      } catch {
        // Don't break other listeners
      }
    }
  }

  function connectSSE(): void {
    if (typeof EventSource === "undefined") return;

    try {
      es = new EventSource("/api/flags/stream");

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as { type?: string; key?: string };
          if (msg.type === "connected" || msg.type === "heartbeat") return;
          if (msg.key) {
            evaluate([msg.key]);
          }
        } catch {
          // Ignore malformed SSE events
        }
      };

      es.onerror = () => {
        es?.close();
        es = null;
        setTimeout(connectSSE, 5000);
      };
    } catch {
      // SSE not available — fall back to cache
    }
  }

  const mod: FlagsModule = {
    get(key) {
      return cache.get(key);
    },

    getAll() {
      return Object.fromEntries(cache);
    },

    seed(values) {
      for (const [key, value] of Object.entries(values)) {
        cache.set(key, value);
      }
    },

    onUpdate(key, cb) {
      listeners.push({ key, cb });
      return () => {
        const idx = listeners.findIndex((l) => l.key === key && l.cb === cb);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },

    onAnyUpdate(cb) {
      anyListeners.push(cb);
      return () => {
        const idx = anyListeners.indexOf(cb);
        if (idx >= 0) anyListeners.splice(idx, 1);
      };
    },

    async evaluate(context) {
      if (context) {
        // Update context then refetch
      }
      await evaluate();
    },

    isReady() {
      return ready;
    },
  };

  // Initial bulk fetch — blocking
  evaluate().then(() => {
    ready = true;
    connectSSE();
  });

  return mod;
}
