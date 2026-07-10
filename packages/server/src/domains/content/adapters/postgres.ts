import { and, eq } from "drizzle-orm";
import { contentEntries, contentTypes } from "../schema";
import type { ContentStorage, ContentValidator, ContentEntryDTO } from "../ports";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export function createPostgresContentAdapter(db: NodePgDatabase): ContentStorage {
  return {
    create: async (tenantId, type, slug, data) => {
      const [entry] = await db.insert(contentEntries)
        .values({ tenantId, type, slug, data })
        .returning();
      if (!entry) throw new Error("Failed to create content entry");
      return mapRow(entry);
    },
    findByType: async (tenantId, type) => {
      const rows = await db.select()
        .from(contentEntries)
        .where(and(eq(contentEntries.tenantId, tenantId), eq(contentEntries.type, type)));
      return rows.map(mapRow);
    },
    findBySlug: async (tenantId, type, slug) => {
      const [entry] = await db.select()
        .from(contentEntries)
        .where(and(
          eq(contentEntries.tenantId, tenantId),
          eq(contentEntries.type, type),
          eq(contentEntries.slug, slug),
        ));
      return entry ? mapRow(entry) : null;
    },
    update: async (tenantId, type, slug, data) => {
      const [entry] = await db.update(contentEntries)
        .set({ data, updated_at: new Date() })
        .where(and(
          eq(contentEntries.tenantId, tenantId),
          eq(contentEntries.type, type),
          eq(contentEntries.slug, slug),
        ))
        .returning();
      if (!entry) throw new Error("Failed to update content entry");
      return mapRow(entry);
    },
    delete: async (tenantId, type, slug) => {
      await db.delete(contentEntries)
        .where(and(
          eq(contentEntries.tenantId, tenantId),
          eq(contentEntries.type, type),
          eq(contentEntries.slug, slug),
        ));
    },
  };
}

function mapRow(row: typeof contentEntries.$inferSelect): ContentEntryDTO {
  return {
    id: row.id,
    tenantId: row.tenantId,
    type: row.type,
    slug: row.slug,
    data: row.data as Record<string, unknown>,
    status: row.status,
    meta: (row.meta || {}) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const validator: ContentValidator = {
  validate: async (type, data) => {
    return { valid: true };
  },
};