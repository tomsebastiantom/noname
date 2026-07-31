import type { z } from "zod";
import { ValidationError } from "./domain-error";

/** Parse Zod input or throw `ValidationError` — use in route handlers instead of ad-hoc `c.json`. */
export function parseBody<T>(result: z.ZodSafeParseResult<T>, label: string): T {
  if (!result.success) {
    throw new ValidationError("body", `Invalid ${label}`);
  }
  return result.data;
}
