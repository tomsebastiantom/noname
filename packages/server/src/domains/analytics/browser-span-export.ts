import {
  type Attributes,
  context,
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  type Tracer,
  trace,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import type { BrowserSpanInput } from "./browser-span-ingest";

const DEFAULT_BROWSER_SERVICE = "noname-browser";
const DEFAULT_OTLP = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces";

let browserTracer: Tracer | null = null;

function browserServiceName(input: BrowserSpanInput): string {
  const fromAttrs = input.attributes?.["browser.service"];
  return typeof fromAttrs === "string" && fromAttrs.length > 0
    ? fromAttrs
    : DEFAULT_BROWSER_SERVICE;
}

function getBrowserTracer(serviceName: string): Tracer {
  if (!browserTracer) {
    const provider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        "service.name": serviceName,
        "deployment.environment": process.env.NODE_ENV || "development",
      }),
      spanProcessors: [
        new BatchSpanProcessor(new OTLPTraceExporter({ url: DEFAULT_OTLP }), {
          scheduledDelayMillis: 1000,
        }),
      ],
    });
    browserTracer = provider.getTracer("noname-browser-ingest", "0.0.1");
  }
  return browserTracer;
}

/** Re-export browser spans on a dedicated Jaeger service (noname-browser). */
export function recordBrowserSpans(orgId: string, spans: BrowserSpanInput[]): number {
  let accepted = 0;

  for (const input of spans) {
    const serviceName = browserServiceName(input);
    const tracer = getBrowserTracer(serviceName);
    const attrs: Attributes = {
      "org.id": orgId,
      "browser.exported": true,
      "browser.source_span_id": input.spanId,
      ...(input.attributes ?? {}),
    };

    const parentContext = trace.setSpanContext(context.active(), {
      traceId: input.traceId,
      spanId: input.parentSpanId ?? input.spanId,
      traceFlags: TraceFlags.SAMPLED,
      isRemote: true,
    });

    const startNs = input.startTimeMs * 1_000_000;
    const endNs = startNs + input.durationMs * 1_000_000;
    const span = tracer.startSpan(
      input.name,
      {
        kind: SpanKind.CLIENT,
        startTime: startNs,
        attributes: attrs,
      },
      parentContext,
    );

    if (input.status === "error") {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    span.end(endNs);
    accepted += 1;
  }

  return accepted;
}

/** @internal Test-only reset */
export function resetBrowserTracerForTests(): void {
  browserTracer = null;
}
