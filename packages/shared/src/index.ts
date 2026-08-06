/**
 * @noname/shared — cross-runtime pure helpers only.
 *
 * Before adding exports, read packages/shared/README.md (AI agents: mandatory).
 * Do not use this package as a junk drawer.
 */
export { coerceScalarString } from "./coerce-scalar-string";
export {
  COMMS_EMAIL_PROVIDERS,
  COMMS_PROVIDERS,
  COMMS_SMS_PROVIDERS,
  isCommsEmailProviderName,
  isCommsProviderName,
  type CommsEmailProviderName,
  type CommsProviderName,
  type CommsSmsProviderName,
} from "./comms-providers";
export {
  assertValidStoreSlug,
  normalizeStoreSlug,
  storeSlugFromHost,
} from "./store-slug";
