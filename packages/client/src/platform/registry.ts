import { defineRegistry } from "@json-render/react";
import { navigationActions } from "../core/actions/navigation";
import { coreComponents } from "../core/components";
import { catalog } from "./catalog";

export const { registry, handlers, executeAction } = defineRegistry(catalog, {
  components: coreComponents,
  actions: navigationActions,
});
