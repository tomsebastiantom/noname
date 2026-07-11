import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ data }, status);
}

export function created<T>(c: Context, data: T) {
  return c.json({ data }, 201);
}

export function notFound(c: Context, message = "not found") {
  return c.json({ error: message }, 404);
}

export function error(c: Context, message = "internal error", status: ContentfulStatusCode = 500) {
  return c.json({ error: message }, status);
}

export function deleted(c: Context, status: ContentfulStatusCode = 200) {
  return c.json({ deleted: true }, status);
}
