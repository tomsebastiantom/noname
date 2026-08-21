import { z } from "zod";

/**
 * Spec-driven-UI props contract — config (behavior) + labels (all copy).
 * See skills/spec-driven-ui/props-contract.md
 *
 * Used by: @noname/client, @noname/extensions, scripts/seed (specProps).
 */

/** Zod schema builder for catalog component props. Argument order: labels first, then config. */
export function catalogProps<TLabels extends z.ZodRawShape, TConfig extends z.ZodRawShape>(
  labels: TLabels,
  config: TConfig,
) {
  return z.object({
    config: z.object(config),
    labels: z.object(labels),
  });
}

export type CatalogProps<
  TConfig extends Record<string, unknown>,
  TLabels extends Record<string, unknown>,
> = {
  config: TConfig;
  labels: TLabels;
};

/** Plain-data variant for seed scripts and tests that build spec JSON (no zod). Argument order: config first, then labels. */
export function specProps<
  TConfig extends Record<string, unknown>,
  TLabels extends Record<string, unknown>,
>(config: TConfig, labels: TLabels) {
  return { config, labels };
}
