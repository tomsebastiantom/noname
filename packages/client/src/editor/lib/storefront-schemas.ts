import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import type { ZodType } from "zod";
import { commerceComponentSchemas } from "@noname/extensions/commerce/catalog-schemas";
import { coreComponentSchemas } from "../../core/catalog-schemas";

export type CatalogComponentSchemaEntry = {
  props: ZodType;
  description?: string;
  slots?: string[];
};

/** Storefront catalog component schemas (core layout + commerce extensions). */
export const storefrontComponentSchemas: Record<string, CatalogComponentSchemaEntry> = {
  ...shadcnComponentDefinitions,
  ...commerceComponentSchemas,
  ...coreComponentSchemas,
};
