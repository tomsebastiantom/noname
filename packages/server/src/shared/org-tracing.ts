import { trace } from "@opentelemetry/api";
import type { MiddlewareHandler } from "hono";
import { ORG_ID_KEY } from "./org";

/** Attach org.id to the active HTTP span for Jaeger per-store filtering. */
export const orgTracingMiddleware: MiddlewareHandler = async (c, next) => {
  const span = trace.getActiveSpan();
  const orgId = c.get(ORG_ID_KEY);
  if (span && orgId) {
    span.setAttribute("org.id", orgId);
  }
  await next();
};
