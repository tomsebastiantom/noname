import type { FlagsModule } from "../types";

type FlagValue = unknown;
type FlagMap = Map<string, FlagValue>;
type Callback = (value: FlagValue) => void;
type ChangeCallback = Array<{ key: string; cb: Callback }>;

export function createFlagsModule(
  endpoint: string,
  orgId: string,
  getContext: () => {
    contextHash: string;
    schemaId: string | null;
    variantId: string | null;
    contextProperties: Record<string, string | number | boolean>;
  },
): FlagsModule {
  const cache: FlagMap = new Map();
  const listeners: ChangeCallback = [];
  let es: EventSource | null = null;
  let ready = false;

  async function evaluate(flagKeys?: string[]): Promise<void> {
    const ctx = getContext();
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          context: {
            orgId,
            contextHash: ctx.contextHash,
            schemaId: ctx.schemaId,
            variantId: ctx.variantId,
            contextProperties: ctx.contextProperties,
          },
          flagKeys,
        }),
      });

      if (!res.ok) return;

      const data = (await res.json()) as {
        evaluations: Array<{ flagKey: string; value: unknown }>;
      };
      for (const ev of data.evaluations) {
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
  }

  function connectSSE(): void {
    if (typeof EventSource === "undefined") return;

    try {
      es = new EventSource(`/api/flags/stream?orgId=${encodeURIComponent(orgId)}`);

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

    onUpdate(key, cb) {
      listeners.push({ key, cb });
      return () => {
        const idx = listeners.findIndex((l) => l.key === key && l.cb === cb);
        if (idx >= 0) listeners.splice(idx, 1);
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
