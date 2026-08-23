import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
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
  // Our core schemas are canonical — spread after shadcn so they win name conflicts.
  ...shadcnComponentDefinitions,
  ...commerceComponentSchemas,
  ...coreComponentSchemas,
};
