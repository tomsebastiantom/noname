import { z } from "zod";

/** External integration unique key (e.g. provider config id from the OAuth adapter). */
export const integrationIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

export function parseIntegrationId(value: unknown): string {
  return integrationIdSchema.parse(value);
}
