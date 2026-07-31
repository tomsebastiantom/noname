import { context, propagation } from "@opentelemetry/api";

export type TraceCarrier = {
  traceparent?: string;
  tracestate?: string;
};

/** Inject active OTEL context for BullMQ job payloads (worker extracts via propagation.extract). */
export function injectTraceCarrier(): TraceCarrier {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);
  return {
    traceparent: carrier.traceparent,
    tracestate: carrier.tracestate,
  };
}
