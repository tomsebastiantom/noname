/**
 * Spec-driven-UI props contract — flat props only (config + labels merged at top level).
 * See skills/spec-driven-ui/props-contract.md
 *
 * Used by: scripts/seed (specProps).
 */

/** Plain-data variant for seed scripts and tests that build spec JSON (no zod). Flat merge of config + labels. */
export function specProps<
  TConfig extends Record<string, unknown>,
  TLabels extends Record<string, unknown>,
>(config: TConfig, labels: TLabels) {
  return { ...config, ...labels };
}
