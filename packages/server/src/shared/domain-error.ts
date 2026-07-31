import type { ContentfulStatusCode } from "hono/utils/http-status";

export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: ContentfulStatusCode = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export class NotFoundError extends DomainError {
  constructor(entity: string, id: string) {
    super(`${entity} not found: ${id}`, "NOT_FOUND", 404, { entity, id });
  }
}

export class ValidationError extends DomainError {
  constructor(field: string, message: string) {
    super(`Validation failed for ${field}: ${message}`, "VALIDATION_ERROR", 400, {
      field,
      message,
    });
  }
}

export class UnauthorizedError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "UNAUTHORIZED", 401, details);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "CONFLICT", 409, details);
  }
}

export class ServiceUnavailableError extends DomainError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "SERVICE_UNAVAILABLE", 503, details);
  }
}
