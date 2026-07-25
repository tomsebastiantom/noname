import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { coreActionSchemas, coreComponentSchemas } from "../core/catalog-schemas";

/** Platform catalog — core components and actions only. Vertical packs merge at runtime via manifest. */
export const catalog = defineCatalog(schema, {
  components: coreComponentSchemas,
  actions: coreActionSchemas,
});
