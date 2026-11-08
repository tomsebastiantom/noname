import { randomUUID } from "node:crypto";
import type { MiddlewareHandler } from "hono";
import { runWithRequestContext } from "./request-context";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

const HEADER = "x-request-id";
/** Accept upstream ids, but only a bounded, log-safe charset. */
const SAFE_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * One id per request, echoed to the client and available to services through AsyncLocalStorage.
 * It joins the audit row to the access log once access logging exists.
 */
export const requestIdMiddleware: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header(HEADER)?.trim();
  const requestId = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();

  c.set("requestId", requestId);
  c.header(HEADER, requestId);

  await runWithRequestContext(requestId, () => next());
};
