import { commerceActionSchemas } from "@noname/extensions/commerce/catalog-schemas";
import { coreActionSchemas } from "../../core/catalog-schemas";

/** Auth/admin actions stay out of the merchant-facing picker. */
const EDITOR_ACTION_DENY = new Set([
  "login",
  "logout",
  "idpLogin",
  "requestPasswordReset",
  "confirmPasswordReset",
  "register",
  "verifyMfa",
  "confirmMfaEnrollment",
]);

export type StorefrontActionOption = {
  id: string;
  label: string;
};

let cachedOptions: StorefrontActionOption[] | null = null;

export function storefrontEditorActionOptions(): StorefrontActionOption[] {
  if (cachedOptions) return cachedOptions;

  const merged = { ...coreActionSchemas, ...commerceActionSchemas };
  cachedOptions = Object.entries(merged)
    .filter(([id]) => !EDITOR_ACTION_DENY.has(id))
    .map(([id, schema]) => ({
      id,
      label: schema.description?.trim() || id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return cachedOptions;
}

export function isActionFieldKey(key: string): boolean {
  return key === "action" || key === "ctaAction" || key.endsWith("Action");
}
