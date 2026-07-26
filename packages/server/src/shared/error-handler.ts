import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { DomainError, NotFoundError, ValidationError } from "./domain-error";

export function handleDomainError(err: unknown, c: Context): Response | null {
  if (err instanceof ValidationError) {
    return c.json(
      { error: err.message, code: err.code, details: err.details },
      400 as ContentfulStatusCode,
    );
  }
  if (err instanceof NotFoundError) {
    return c.json(
      { error: err.message, code: err.code, details: err.details },
      404 as ContentfulStatusCode,
    );
  }
  if (err instanceof DomainError) {
    return c.json(
      { error: err.message, code: err.code, details: err.details },
      400 as ContentfulStatusCode,
    );
  }
  return null;
}
