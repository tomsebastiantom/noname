import { adminActionSchemas } from "./admin-actions";
import { commerceActionSchemas } from "./commerce";
import { coreActionSchemas } from "./core";
import { editorActionSchemas } from "./editor-actions";

/**
 * Every action the platform can execute from a layout, in one node-safe map.
 *
 * The M2 check uses this as the action vocabulary: an action a block references must be a declared action,
 * otherwise the block renders a control that does nothing. Capability/permission mapping is deliberately not
 * encoded here yet — that is the remaining half of M2 and needs the capability registry, not a schema.
 */
export const catalogActionSchemas = {
  ...coreActionSchemas,
  ...commerceActionSchemas,
  ...adminActionSchemas,
  ...editorActionSchemas,
};

export function catalogActionNames(): string[] {
  return Object.keys(catalogActionSchemas).sort();
}

export function catalogHasAction(name: string): boolean {
  return Boolean((catalogActionSchemas as Record<string, unknown>)[name]);
}
