import { commerceComponentSchemas } from "@noname/extensions/commerce/catalog-schemas";
import type { ZodType } from "zod";
import { coreComponentSchemas } from "../../core/catalog-schemas";

export type CatalogComponentSchemaEntry = {
  props: ZodType;
  description?: string;
  slots?: string[];
};

/** Storefront catalog component schemas (core layout + commerce extensions). */
export const storefrontComponentSchemas: Record<string, CatalogComponentSchemaEntry> = {
  ...coreComponentSchemas,
  ...commerceComponentSchemas,
};
