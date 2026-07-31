import type { TenantSettingsDTO } from "../ports";
import { DEFAULT_TENANT_AUTH } from "../tenant/auth-config";
import { DEFAULT_DEFAULT_LOCALE, DEFAULT_LOCALES } from "./constants";

export function defaultTenantSettings(): Omit<TenantSettingsDTO, "id" | "orgId"> {
  return {
    slug: null,
    locales: [...DEFAULT_LOCALES],
    defaultLocale: DEFAULT_DEFAULT_LOCALE,
    seo: {},
    integrations: {},
    auth: { ...DEFAULT_TENANT_AUTH },
  };
}
