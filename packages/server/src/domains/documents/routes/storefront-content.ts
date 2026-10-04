import { Hono } from "hono";
import { getOrgId } from "../../../shared/org";
import { requirePublicActor } from "../../../shared/public-actor";
import { error, notFound, ok } from "../../../shared/respond";
import type {
  ContentTypeDocumentService,
  DocumentStorage,
  PublicContentSearchField,
  TenantSettingsService,
} from "../ports";

const CONTENT_TYPE_RE = /^[a-z0-9_]{1,64}$/;
const DEFAULT_PAGE_SIZE = 24;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000;
const MAX_QUERY_LENGTH = 160;

type StorefrontContentDeps = {
  contentTypes: ContentTypeDocumentService;
  storage: DocumentStorage;
  tenantSettings: TenantSettingsService;
};

function canonicalLocale(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return Intl.getCanonicalLocales(value.trim())[0] ?? null;
  } catch {
    return null;
  }
}

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  return Math.min(Math.max(Number(value), min), max);
}

function publicFieldValue(
  raw: unknown,
  isLocalizable: boolean,
  locale: string,
  defaultLocale: string,
): unknown {
  if (!isLocalizable || !raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const localized = raw as Record<string, unknown>;
  if (Object.hasOwn(localized, locale)) return localized[locale];
  if (Object.hasOwn(localized, defaultLocale)) return localized[defaultLocale];
  // Do not fall back to an arbitrary locale which may not be enabled for this tenant.
  return undefined;
}

export function createStorefrontContentRoutes(deps: StorefrontContentDeps) {
  const routes = new Hono();

  routes.get("/:type", async (c) => {
    const orgId = getOrgId(c);
    if (!orgId) return error(c, "Tenant context required", 401);
    const actor = await requirePublicActor(c, orgId, deps.tenantSettings);
    if (!actor) return error(c, "Valid publishable key required", 401);

    const type = c.req.param("type");
    if (!CONTENT_TYPE_RE.test(type)) return error(c, "Invalid content type", 400);
    const definition = await deps.contentTypes.get(actor.orgId, type);
    if (!definition) return notFound(c);

    const settings = await deps.tenantSettings.get(actor.orgId);
    const configuredLocales = (settings.locales ?? [])
      .map((locale) => canonicalLocale(locale))
      .filter((locale): locale is string => locale !== null);
    const defaultLocale =
      canonicalLocale(settings.defaultLocale) ?? configuredLocales[0] ?? "en-US";
    const requestedLocale = canonicalLocale(c.req.query("locale") ?? undefined);
    const locale =
      requestedLocale && configuredLocales.includes(requestedLocale)
        ? requestedLocale
        : defaultLocale;

    const requestedCollection = c.req.query("collection")?.trim();
    let collectionId: string | undefined;
    if (requestedCollection) {
      collectionId =
        (await deps.storage.findCollectionIdBySlug(actor.orgId, requestedCollection)) ?? undefined;
      if (!collectionId) {
        return ok(c, {
          items: [],
          locale,
          limit: parseBoundedInteger(c.req.query("limit"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE),
          offset: parseBoundedInteger(c.req.query("offset"), 0, 0, MAX_OFFSET),
          nextOffset: null,
        });
      }
    }

    const limit = parseBoundedInteger(c.req.query("limit"), DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
    const offset = parseBoundedInteger(c.req.query("offset"), 0, 0, MAX_OFFSET);
    const query = c.req.query("q")?.trim() ?? "";
    if (query.length > MAX_QUERY_LENGTH) {
      return error(c, `Search query must be at most ${MAX_QUERY_LENGTH} characters`, 400);
    }
    const publicFields = definition.schema.fields.filter((field) =>
      field.permissions?.read?.includes("public"),
    );
    const searchFields: PublicContentSearchField[] = publicFields.map((field) => ({
      key: field.key,
      isLocalizable: field.isLocalizable,
    }));
    const records = await deps.storage.listPublishedContent({
      orgId: actor.orgId,
      type,
      collectionId,
      locale,
      defaultLocale,
      query: query || undefined,
      searchFields,
      limit: limit + 1,
      offset,
    });
    const hasMore = records.length > limit;
    const items = records.slice(0, limit).map((record) => {
      const data: Record<string, unknown> = {};
      for (const field of publicFields) {
        const value = publicFieldValue(
          record.data[field.key],
          field.isLocalizable,
          locale,
          defaultLocale,
        );
        if (value !== undefined) data[field.key] = value;
      }
      return { id: record.id, data };
    });

    return ok(c, {
      items,
      locale,
      limit,
      offset,
      nextOffset: hasMore ? offset + limit : null,
    });
  });

  return routes;
}
