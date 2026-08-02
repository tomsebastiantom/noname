import { storefrontComponentSchemas } from "./storefront-schemas";

/** True when catalog schema declares at least one slot (accepts child blocks). */
export function componentAcceptsChildren(componentType: string): boolean {
  const slots = storefrontComponentSchemas[componentType]?.slots;
  return Array.isArray(slots) && slots.length > 0;
}
