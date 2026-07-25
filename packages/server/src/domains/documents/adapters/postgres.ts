import { and, desc, eq, sql } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import type {
  ContentTypeDTO,
  ContentTypeSchema,
  DocumentDTO,
  DocumentStorage,
  TenantSettingsDTO,
} from "../ports";
import { documents, documentTypes } from "../schema";

export function createPostgresDocumentStorage(db: Database): DocumentStorage {
  return {
    // ---- content type schema registry ----
    async createContentType(orgId, name, schema) {
      const [row] = await db
        .insert(documentTypes)
        .values({ orgId, name, schema: schema as unknown as Record<string, unknown> })
        .returning();
      if (!row) throw new Error("Failed to create content type");
      return mapContentType(row);
    },
    async findContentTypes(orgId) {
      const rows = await db.select().from(documentTypes).where(eq(documentTypes.orgId, orgId));
      return rows.map(mapContentType);
    },
    async findContentTypeByName(orgId, name) {
      const [row] = await db
        .select()
        .from(documentTypes)
        .where(and(eq(documentTypes.orgId, orgId), eq(documentTypes.name, name)));
      return row ? mapContentType(row) : null;
    },
    async updateContentType(orgId, name, schema) {
      const [row] = await db
        .update(documentTypes)
        .set({ schema: schema as unknown as Record<string, unknown>, updated_at: new Date() })
        .where(and(eq(documentTypes.orgId, orgId), eq(documentTypes.name, name)))
        .returning();
      if (!row) throw new Error(`Content type '${name}' not found`);
      return mapContentType(row);
    },

    // ---- tenant settings ----
    async getTenantSettings(orgId) {
      const row = await findRow(db, orgId, "tenant_settings", "default");
      return row ? toTenantSettings(row) : null;
    },
    async upsertTenantSettings(orgId, data) {
      const existing = await findRow(db, orgId, "tenant_settings", "default");
      const merged = {
        locales: data.locales,
        defaultLocale: data.defaultLocale,
        seo: data.seo,
        integrations: data.integrations,
      };
      if (existing) {
        const [row] = await db
          .update(documents)
          .set({ data: merged, updated_at: new Date() })
          .where(eq(documents.id, existing.id))
          .returning();
        if (!row) throw new Error("Failed to update tenant settings");
        return toTenantSettings(row);
      }
      const [row] = await db
        .insert(documents)
        .values({
          orgId,
          type: "tenant_settings",
          key: "default",
          data: merged,
          status: "draft",
        })
        .returning();
      if (!row) throw new Error("Failed to create tenant settings");
      return toTenantSettings(row);
    },

    // ---- generic documents ----
    async createDocument(input) {
      const segment = input.segment || "default";
      const latest = await latestVersion(db, input.orgId, input.type, input.key, segment);
      const version = latest ? latest + 1 : 1;
      const [row] = await db
        .insert(documents)
        .values({
          orgId: input.orgId,
          type: input.type,
          key: input.key,
          segment,
          version,
          status: input.status || "draft",
          baseVersion: input.baseVersion ?? null,
          data: input.data,
          meta: input.meta ?? {},
        })
        .returning();
      if (!row) throw new Error("Failed to create document");
      return mapDocument(row);
    },
    async listDocuments(orgId, filters = {}) {
      const conditions = [eq(documents.orgId, orgId)];
      if (filters.type) conditions.push(eq(documents.type, filters.type));
      if (filters.segment) conditions.push(eq(documents.segment, filters.segment));
      if (filters.status) conditions.push(eq(documents.status, filters.status));
      if (filters.key) conditions.push(eq(documents.key, filters.key));
      const rows = await db
        .select()
        .from(documents)
        .where(and(...conditions));
      return rows.map(mapDocument);
    },
    async findDocument(orgId, type, key, segment) {
      const conditions = [
        eq(documents.orgId, orgId),
        eq(documents.type, type),
        eq(documents.key, key),
      ];
      if (segment) conditions.push(eq(documents.segment, segment));
      const [row] = await db
        .select()
        .from(documents)
        .where(and(...conditions));
      return row ? mapDocument(row) : null;
    },
    async findDocumentById(id) {
      const [row] = await db.select().from(documents).where(eq(documents.id, id));
      return row ? mapDocument(row) : null;
    },
    async updateDocument(id, data, meta) {
      const [row] = await db
        .update(documents)
        .set({ data, meta: meta ?? undefined, updated_at: new Date() })
        .where(eq(documents.id, id))
        .returning();
      if (!row) throw new Error("Failed to update document");
      return mapDocument(row);
    },
    async publishDocument(id) {
      const existing = await findById(db, id);
      if (!existing) throw new Error("Document not found");

      // Archive any currently-published sibling of the same (type, key, segment).
      await db
        .update(documents)
        .set({ status: "archived", updated_at: new Date() })
        .where(
          and(
            eq(documents.orgId, existing.orgId),
            eq(documents.type, existing.type),
            eq(documents.key, existing.key),
            eq(documents.segment, existing.segment),
            eq(documents.status, "published"),
            sql`${documents.id} != ${id}`,
          ),
        );

      const [row] = await db
        .update(documents)
        .set({ status: "published", updated_at: new Date() })
        .where(eq(documents.id, id))
        .returning();
      if (!row) throw new Error("Failed to publish document");
      return mapDocument(row);
    },
    async archiveDocument(id) {
      const [row] = await db
        .update(documents)
        .set({ status: "archived", updated_at: new Date() })
        .where(eq(documents.id, id))
        .returning();
      if (!row) throw new Error("Failed to archive document");
      return mapDocument(row);
    },
    async deleteDocument(id) {
      await db.delete(documents).where(eq(documents.id, id));
    },

    async findAssetByHash(orgId, hash) {
      const [row] = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.orgId, orgId),
            eq(documents.type, "asset"),
            sql`${documents.data}->>'hash' = ${hash}`,
          ),
        )
        .orderBy(desc(documents.created_at))
        .limit(1);
      return row ? mapDocument(row) : null;
    },
  };
}

async function findRow(
  db: Database,
  orgId: string,
  type: string,
  key: string,
): Promise<DocumentRow | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.orgId, orgId), eq(documents.type, type), eq(documents.key, key)));
  return row ?? null;
}

async function findById(db: Database, id: string): Promise<DocumentRow | null> {
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
  return row ?? null;
}

async function latestVersion(
  db: Database,
  orgId: string,
  type: string,
  key: string,
  segment: string,
): Promise<number | null> {
  const rows = await db
    .select({ version: documents.version })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, orgId),
        eq(documents.type, type),
        eq(documents.key, key),
        eq(documents.segment, segment),
      ),
    )
    .orderBy(desc(documents.version))
    .limit(1);
  return rows[0]?.version ?? null;
}

type DocumentRow = typeof documents.$inferSelect;
type ContentTypeRow = typeof documentTypes.$inferSelect;

function mapDocument(row: DocumentRow): DocumentDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    type: row.type,
    key: row.key,
    version: row.version,
    segment: row.segment,
    status: row.status,
    baseVersion: row.baseVersion ?? null,
    data: (row.data ?? {}) as Record<string, unknown>,
    meta: (row.meta ?? {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContentType(row: ContentTypeRow): ContentTypeDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    name: row.name,
    schema: row.schema as unknown as ContentTypeSchema,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toTenantSettings(row: DocumentRow): TenantSettingsDTO {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const seo = (data.seo ?? {}) as Record<string, unknown>;
  const integrations = (data.integrations ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    orgId: row.orgId,
    locales: (data.locales as string[]) ?? ["en-US"],
    defaultLocale: (data.defaultLocale as string) ?? "en-US",
    seo: {
      metaTitleTemplate: seo.metaTitleTemplate as string | undefined,
      metaDescription: seo.metaDescription as string | undefined,
      ogImage: seo.ogImage as { assetId: string } | undefined,
      twitterCard: seo.twitterCard as string | undefined,
      canonicalDomain: seo.canonicalDomain as string | undefined,
    },
    integrations: integrations as TenantSettingsDTO["integrations"],
  };
}
