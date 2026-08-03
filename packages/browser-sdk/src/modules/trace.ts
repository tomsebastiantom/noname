import { onUnload } from "../core/lifecycle";
import { Batcher, sendBeacon, sendWithRetry } from "../core/transport";
import type { BrowserSpanExport, TraceModule } from "../types";

let traceId: string;
let currentSpanId: string;
let propagateFetch = false;
let exportSpans = false;
let serviceName = "noname-browser";

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

function sanitizeUrl(url: string): string {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : undefined);
    return `${parsed.pathname}${parsed.search ? "?…" : ""}`;
  } catch {
    return url.split("?")[0] ?? url;
  }
}

function sanitizeAttributes(attrs: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (key.length > 128 || value.length > 512) continue;
    out[key] = value;
  }
  return out;
}

export function getCurrentTraceContext(): { traceId: string; spanId: string } {
  return { traceId, spanId: currentSpanId };
}

export function createTraceModule(options: {
  enabled: boolean;
  serviceName?: string;
  propagateFetch?: boolean;
  exportSpans?: boolean;
  sampleRate?: number;
  endpoint?: string;
  getHeaders?: () => Record<string, string>;
  batchSize?: number;
  flushIntervalMs?: number;
}): TraceModule & { flush: () => Promise<void> } {
  traceId = generateTraceId();
  currentSpanId = generateSpanId();
  propagateFetch = options.propagateFetch ?? false;
  exportSpans = options.exportSpans ?? false;
  serviceName = options.serviceName ?? "noname-browser";

  if (exportSpans && (options.sampleRate ?? 1) < 1) {
    if (Math.random() >= (options.sampleRate ?? 1)) {
      exportSpans = false;
    }
  }

  const endpoint = options.endpoint ?? "/api/analytics/spans";
  const getHeaders = options.getHeaders ?? (() => ({}));
  let batcher: Batcher<BrowserSpanExport> | null = null;

  function enqueueSpan(record: BrowserSpanExport): void {
    if (!exportSpans || !batcher) return;
    batcher.push(record);
  }

  if (exportSpans) {
    batcher = new Batcher<BrowserSpanExport>(
      async (batch) => {
        await sendWithRetry(endpoint, JSON.stringify({ spans: batch }), 1, getHeaders());
      },
      { batchSize: options.batchSize ?? 20, flushIntervalMs: options.flushIntervalMs ?? 5000 },
    );

    onUnload(() => {
      const batch = batcher?.drainForBeacon() ?? [];
      if (batch.length > 0) {
        sendBeacon(endpoint, JSON.stringify({ spans: batch }));
      }
    });

    if (typeof window !== "undefined") {
      const pageStart = performance.timeOrigin;
      const recordPageLoad = () => {
        enqueueSpan({
          traceId,
          spanId: currentSpanId,
          name: "document.load",
          startTimeMs: Math.round(pageStart),
          durationMs: Math.max(0, Math.round(performance.now())),
          attributes: sanitizeAttributes({
            "browser.service": serviceName,
            "page.path": window.location.pathname,
          }),
          status: "ok",
        });
      };
      if (document.readyState === "complete") {
        recordPageLoad();
      } else {
        window.addEventListener("load", recordPageLoad, { once: true });
      }
    }
  }

  if (typeof window !== "undefined" && propagateFetch) {
    const origFetch = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      if (!headers.has("traceparent")) {
        headers.set("traceparent", buildTraceParent());
      }

      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : "url" in input
              ? input.url
              : String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const parentSpanId = currentSpanId;
      const spanId = generateSpanId();
      currentSpanId = spanId;
      const start = Date.now();
      const attrs: Record<string, string> = sanitizeAttributes({
        "browser.service": serviceName,
        "http.method": method,
        "http.url": sanitizeUrl(url),
      });

      const finish = (status: "ok" | "error", extra?: Record<string, string>) => {
        currentSpanId = parentSpanId;
        enqueueSpan({
          traceId,
          spanId,
          parentSpanId,
          name: `fetch ${method} ${sanitizeUrl(url)}`,
          startTimeMs: start,
          durationMs: Math.max(0, Date.now() - start),
          attributes: { ...attrs, ...extra },
          status,
        });
      };

      return origFetch(input, { ...init, headers })
        .then((res) => {
          finish(res.ok ? "ok" : "error", { "http.status_code": String(res.status) });
          return res;
        })
        .catch((err) => {
          finish("error");
          throw err;
        });
    };
  }

  return {
    startSpan(name, attributes) {
      const spanId = generateSpanId();
      const parentSpanId = currentSpanId;
      currentSpanId = spanId;

      const start = Date.now();
      const attrs: Record<string, string> = sanitizeAttributes({
        "browser.service": serviceName,
        ...attributes,
      });

      return {
        traceId,
        spanId,
        end() {
          const durationMs = Math.max(0, Date.now() - start);
          attrs.duration_ms = String(durationMs);
          attrs["span.name"] = name;
          currentSpanId = parentSpanId;
          enqueueSpan({
            traceId,
            spanId,
            parentSpanId,
            name,
            startTimeMs: start,
            durationMs,
            attributes: attrs,
            status: "ok",
          });
        },
        setAttribute(key, value) {
          attrs[key] = value;
        },
      };
    },

    getTraceHeaders() {
      return { traceparent: buildTraceParent() };
    },

    flush() {
      return batcher?.flush() ?? Promise.resolve();
    },
  };
}

function buildTraceParent(): string {
  return `00-${traceId}-${currentSpanId}-01`;
}
