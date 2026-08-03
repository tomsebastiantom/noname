import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { ConflictError, DomainError } from "./domain-error";
import { isPostgresUniqueViolation } from "./postgres-errors";

export function handleDomainError(err: unknown, c: Context): Response | null {
  if (err instanceof DomainError) {
    return c.json(
      { error: err.message, code: err.code, details: err.details },
      err.httpStatus as ContentfulStatusCode,
    );
  }
  if (isPostgresUniqueViolation(err)) {
    // Fallback only — prefer upsert or ConflictError at the service that owns the insert.
    const conflict = new ConflictError("Resource already exists");
    return c.json(
      { error: conflict.message, code: conflict.code, details: conflict.details },
      conflict.httpStatus as ContentfulStatusCode,
    );
  }
  return null;
}
