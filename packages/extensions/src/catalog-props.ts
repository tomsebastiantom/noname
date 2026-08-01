import { z } from "zod";

/** Same contract as platform client — extensions cannot depend on @noname/client. */
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
