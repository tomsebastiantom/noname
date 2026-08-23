import { defineRegistry } from "@json-render/react";
import { shadcnComponents } from "@json-render/shadcn";
import { adminComponents } from "../admin/registry";
import { coreActionHandlers } from "../core/actions";
import { coreComponents } from "../core/components";
import { catalog } from "./catalog";

export const { registry, handlers, executeAction } = defineRegistry(catalog, {
  // Our core/admin components are canonical — spread after shadcn so they win name conflicts.
  components: { ...shadcnComponents, ...coreComponents, ...adminComponents },
  // Handlers use path-based setState (json-render store); catalog types expect React setState.
  actions: coreActionHandlers as never,
});
