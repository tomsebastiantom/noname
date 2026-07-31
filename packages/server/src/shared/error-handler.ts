import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { DomainError } from "./domain-error";

export function handleDomainError(err: unknown, c: Context): Response | null {
  if (err instanceof DomainError) {
    return c.json(
      { error: err.message, code: err.code, details: err.details },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  return null;
}
