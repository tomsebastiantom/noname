/**
 * @noname/shared — cross-runtime pure helpers only.
 *
 * Before adding exports, read packages/shared/README.md (AI agents: mandatory).
 * Do not use this package as a junk drawer.
 */
export { coerceScalarString } from "./coerce-scalar-string";
export {
  assertValidStoreSlug,
  normalizeStoreSlug,
  storeSlugFromHost,
} from "./store-slug";
