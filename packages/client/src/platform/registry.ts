import { defineRegistry } from "@json-render/react";
import { authActions } from "../core/actions/auth";
import { contentActions } from "../core/actions/content";
import { layoutActions } from "../core/actions/layout";
import { navigationActions } from "../core/actions/navigation";
import { coreComponents } from "../core/components";
import { catalog } from "./catalog";

export const { registry, handlers, executeAction } = defineRegistry(catalog, {
  components: coreComponents,
  actions: {
    ...navigationActions,
    ...authActions,
    ...contentActions,
    ...layoutActions,
  },
});
