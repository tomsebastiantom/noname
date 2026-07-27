import { onUnload } from "../core/lifecycle";
import { sendBeacon } from "../core/transport";
import type { ErrorReport, ErrorsModule } from "../types";

const EXACT_IGNORE = new Set([
  '"Script error."',
  '"Load failed."',
  '"Network request failed."',
  '{"isTrusted":true}',
]);

const PATTERN_IGNORE = [
  /ResizeObserver loop/,
  /websocket error/i,
  /chrome-extension:\/\//,
  /moz-extension:\/\//,
  /safari-extension:\/\//,
];

const MAX_BREADCRUMBS = 20;

interface ErrorDedupEntry {
  count: number;
  lastSent: number;
}

export function createErrorsModule(
  endpoint: string,
  orgId: string,
  getSessionId: () => string,
  getTraceContext: () => { traceId: string; spanId: string },
  getHeaders: () => Record<string, string>,
  dedupWindowMs = 60_000,
  captureConsoleError = true,
): ErrorsModule {
  const dedupMap = new Map<string, ErrorDedupEntry>();
  const breadcrumbs: ErrorReport["breadcrumbs"] = [];
  let user: ErrorReport["user"];
  const queuedErrors: ErrorReport[] = [];

  function hashError(message: string, stack: string): string {
    return `${message}|${stack.split("\n").slice(0, 3).join("\n")}`;
  }

  function sanitizeStack(stack: string): string {
    return stack
      .split("\n")
      .filter((line) => !line.includes("/noname/browser-sdk") && !line.includes("noname.js"))
      .join("\n");
  }

  function shouldCapture(message: string): boolean {
    if (EXACT_IGNORE.has(message)) return false;
    if (PATTERN_IGNORE.some((p) => p.test(message))) return false;
    return true;
  }

  function buildReport(
    error: Error,
    type: ErrorReport["type"],
    context?: Record<string, unknown>,
  ): ErrorReport {
    const trace = getTraceContext();
    return {
      errorId: crypto.randomUUID(),
      sessionId: getSessionId(),
      traceId: trace.traceId,
      spanId: trace.spanId,
      timestamp: Date.now(),
      message: error.message || "Unknown error",
      stack: sanitizeStack(error.stack || ""),
      type,
      breadcrumbs: [...breadcrumbs],
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      user: user ? { ...user } : undefined,
      tags: (context || {}) as Record<string, string>,
      count: 1,
    };
  }

  function ingest(report: ErrorReport): void {
    const key = hashError(report.message, report.stack);
    const existing = dedupMap.get(key);
    const now = Date.now();

    if (existing && now - existing.lastSent < dedupWindowMs) {
      existing.count++;
      return;
    }

    dedupMap.set(key, { count: (existing?.count || 0) + 1, lastSent: now });
    report.count = (existing?.count || 0) + 1;

    queuedErrors.push(report);

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getHeaders() },
      body: JSON.stringify({ orgId, report }),
      keepalive: true,
    }).catch(() => {
      // Error reporting failure — queue for retry on unload
    });
  }

  onUnload(() => {
    if (queuedErrors.length > 0) {
      sendBeacon(endpoint, JSON.stringify({ orgId, reports: queuedErrors }));
    }
  });

  const mod: ErrorsModule = {
    capture(error, context) {
      if (!shouldCapture(error.message || "")) return;
      breadcrumbs.length = 0;
      ingest(buildReport(error, "manual", context));
    },

    breadcrumb(message, data) {
      breadcrumbs.push({ message, data, timestamp: Date.now() });
      if (breadcrumbs.length > MAX_BREADCRUMBS) {
        breadcrumbs.shift();
      }
    },

    setUser(u) {
      user = u;
    },
  };

  if (typeof window !== "undefined") {
    window.addEventListener("error", (event: ErrorEvent) => {
      if (!shouldCapture(event.message || "")) return;
      breadcrumbs.length = 0;
      const error = event.error instanceof Error ? event.error : new Error(event.message);
      ingest(buildReport(error, "unhandled"));
    });

    window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
      const message = event.reason?.message || String(event.reason);
      if (!shouldCapture(message)) return;
      breadcrumbs.length = 0;
      const error = event.reason instanceof Error ? event.reason : new Error(message);
      ingest(buildReport(error, "unhandledrejection"));
    });

    if (captureConsoleError) {
      const orig = console.error;
      console.error = (...args: unknown[]) => {
        orig.apply(console, args);
        for (const arg of args) {
          if (arg instanceof Error) {
            if (shouldCapture(arg.message || "")) {
              breadcrumbs.length = 0;
              ingest(buildReport(arg, "console"));
            }
          }
        }
      };
    }
  }

  return mod;
}
