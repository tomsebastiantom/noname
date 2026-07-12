import type { TraceModule } from "../types";

let traceId: string;
let currentSpanId: string;
let propagateFetch = false;

function generateTraceId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generateSpanId(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function getCurrentTraceContext(): { traceId: string; spanId: string } {
  return { traceId, spanId: currentSpanId };
}

export function createTraceModule(options: {
  enabled: boolean;
  serviceName?: string;
  propagateFetch?: boolean;
}): TraceModule {
  traceId = generateTraceId();
  currentSpanId = generateSpanId();
  propagateFetch = options.propagateFetch || false;

  if (typeof window !== "undefined" && propagateFetch) {
    const origFetch = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (!headers.has("traceparent")) {
        headers.set("traceparent", buildTraceParent());
      }
      return origFetch(input, { ...init, headers });
    };
  }

  return {
    startSpan(name, attributes) {
      const spanId = generateSpanId();
      const parentSpanId = currentSpanId;
      currentSpanId = spanId;

      const start = Date.now();
      const attrs: Record<string, string> = { ...attributes };

      return {
        traceId,
        spanId,
        end() {
          const duration = Date.now() - start;
          attrs.duration_ms = String(duration);
          attrs["span.name"] = name;
          currentSpanId = parentSpanId;
        },
        setAttribute(key, value) {
          attrs[key] = value;
        },
      };
    },

    getTraceHeaders() {
      return { traceparent: buildTraceParent() };
    },
  };
}

function buildTraceParent(): string {
  return `00-${traceId}-${currentSpanId}-01`;
}
