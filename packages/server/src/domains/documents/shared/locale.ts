import type { DocumentStorage } from "../ports";
import { DEFAULT_DEFAULT_LOCALE, DEFAULT_LOCALES } from "../services/constants";

export {
  labelFromContentData,
  pickLocalizedValue,
} from "@noname/documents";

export async function resolveTenantLocales(
  storage: DocumentStorage,
  orgId: string,
): Promise<{ locales: string[]; defaultLocale: string }> {
  const ts = await storage.getTenantSettings(orgId);
  return {
    locales: ts?.locales ?? DEFAULT_LOCALES,
    defaultLocale: ts?.defaultLocale ?? DEFAULT_DEFAULT_LOCALE,
  };
}
