import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { shadcnComponentDefinitions } from "@json-render/shadcn/catalog";
import { adminActionSchemas, adminComponentSchemas } from "../admin/catalog-schemas";
import { coreActionSchemas, coreComponentSchemas } from "../core/catalog-schemas";

/** Platform catalog — core + admin. Extensions merge at runtime via manifest. */
export const catalog = defineCatalog(schema, {
  // Our core/admin schemas are canonical — spread after shadcn so they win name conflicts.
  components: {
    ...shadcnComponentDefinitions,
    ...coreComponentSchemas,
    ...adminComponentSchemas,
  },
  actions: { ...coreActionSchemas, ...adminActionSchemas },
});
