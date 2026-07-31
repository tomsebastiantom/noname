import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { adminActionSchemas, adminComponentSchemas } from "../admin/catalog-schemas";
import { coreActionSchemas, coreComponentSchemas } from "../core/catalog-schemas";

/** Platform catalog — core + admin. Extensions merge at runtime via manifest. */
export const catalog = defineCatalog(schema, {
  components: { ...coreComponentSchemas, ...adminComponentSchemas },
  actions: { ...coreActionSchemas, ...adminActionSchemas },
});
