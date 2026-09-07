import { defineCatalog } from "@json-render/core";
import { defineRegistry } from "@json-render/react";
import { schema } from "@json-render/react/schema";
import { commerceActions } from "./actions";
import { commerceActionSchemas, commerceComponentSchemas } from "./catalog-schemas";
import { commerceComponents } from "./components";

export { commerceLifecycle } from "./lifecycle";

const catalog = defineCatalog(schema, {
  components: commerceComponentSchemas,
  actions: commerceActionSchemas,
});

export const { registry } = defineRegistry(catalog, {
  components: commerceComponents,
  actions: commerceActions,
});
