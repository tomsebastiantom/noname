import { and, eq } from "drizzle-orm";
import { contentEntries, contentTypes } from "../schema";
import type { ContentStorage, ContentValidator } from "../ports";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export function createPostgresContentAdapter(db: NodePgDatabase): ContentStorage {
  return {
    create: async (tenantId, type, slug, data) => {
      const [entry] = await db.insert(contentEntries).values({ tenantId, type, slug, data }).returning();
      return entry;
    },
    findByType: async (tenantId, type) => {
      return db.select().from(contentEntries).where(and(eq(contentEntries.tenantId, tenantId), eq(contentEntries.type, type)));
    },
    findBySlug: async (tenantId, type, slug) => {
      const [entry] = await db.select().from(contentEntries).where(and(eq(contentEntries.tenantId, tenantId), eq(contentEntries.type, type), eq(contentEntries.slug, slug)));
      return entry || null;
    },
    update: async (tenantId, type, slug, data) => {
      const [entry] = await db.update(contentEntries).set({ data }).where(and(eq(contentEntries.tenantId, tenantId), eq(contentEntries.type, type), eq(contentEntries.slug, slug))).returning();
      return entry;
    },
    delete: async (tenantId, type, slug) => {
      await db.delete(contentEntries).where(and(eq(contentEntries.tenantId, tenantId), eq(contentEntries.type, type), eq(contentEntries.slug, slug)));
    },
  };
}

export const validator: ContentValidator = {
  validate: async (type, data) => true, // Phase 1: validate against Zod schema from content_types table
};
