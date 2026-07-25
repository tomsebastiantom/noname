import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Unified documents domain — ONE table owns every versioned JSON document.
//
// Every document-type is just a ROW here, discriminated by `type`:
//   "content"        -> a content entry (product, page, blog, faq, ...)
//   "content_type"   -> a content-type schema definition
//   "page"           -> links a page identity to a layout + content reference
//   "page_tree"      -> URL routing tree (locale-aware slug -> page id)
//   "tenant_settings"-> per-tenant config (locales, SEO defaults, integrations)
//   "asset"          -> media metadata (binary lives in R2, never here)
//   "layout"         -> json-render template; default stores full spec, variants store overrides
//   "backend-logic"  -> future JSON-defined flows
//
// The shared envelope (key, version, status, segment, base_version) is identical
// for all types, but each TYPE keeps its OWN version / status / cache-key / events.
// Type-specific fields live in `data` JSONB, validated by the type's schema.
// Adding a type = one `documentTypes` row + one handler; NO migration, NO new table.

export const documentStatus = pgEnum("document_status", ["draft", "published", "archived"]);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    // Document-type key from the URL `/api/documents/:type`:
    //   "layout"            -> a json-render template
    //   "content_type"      -> a content-type schema definition
    //   "product"/"page"/... -> a content entry (any content type)
    type: text("type").notNull(),
    // Primary lookup key within the type:
    //   content -> the entry's internal UUID id
    //   layout  -> templateName
    //   asset   -> assetId
    //   tenant_settings -> "default"
    key: text("key").notNull(),
    version: integer("version").notNull().default(1),
    // Variant axis for layout (segment). "default" for content.
    segment: text("segment").notNull().default("default"),
    status: documentStatus("status").notNull().default("draft"),
    // Layout variant lineage: the version of the default template this variant's
    // overrides were written against. Used for conflict detection when the default
    // structure shifts under a variant's override paths. Null for content/default.
    baseVersion: integer("base_version"),
    // Type-specific fields + cross-document references (ids/keys). Validated by
    // the type's schema in `documentTypes` (or the override model for layouts).
    data: jsonb("data").notNull(),
    meta: jsonb("meta").default({}),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    // Only one published version per layout template/segment/tenant. Content
    // rows are excluded so a published product doesn't collide with this rule.
    publishedUnique: uniqueIndex("documents_published_unique")
      .on(t.orgId, t.type, t.key, t.segment, t.status)
      .where(sql`${t.status} = 'published' AND ${t.type} = 'layout'`),
    tenantTypeKey: uniqueIndex("documents_tenant_type_key").on(t.orgId, t.type, t.key, t.segment),
    tenantType: index("documents_tenant_type").on(t.orgId, t.type),
  }),
);

// Per-type schema registry. Defining a content type = inserting one row here. The
// schema describes the type's fields (type, isLocalizable, constraints, permissions);
// documents of that type carry matching `data`. No ALTER TABLE to add a type or a
// field — just insert/update a row.
export const documentTypes = pgTable(
  "document_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    schema: jsonb("schema").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    uniqueTypeName: uniqueIndex("document_types_tenant_name").on(t.orgId, t.name),
  }),
);
