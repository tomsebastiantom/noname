import { and, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import type { ContextSignal, ContextStorage, SegmentDTO } from "../ports";
import { contextCache, segments } from "../schema";

export function createPostgresContextAdapter(db: Database): ContextStorage {
  return {
    async saveSegment(orgId, hash, signals) {
      const [row] = await db
        .insert(segments)
        .values({ orgId, hash, signals })
        .onConflictDoUpdate({ target: [segments.orgId, segments.hash], set: { signals } })
        .returning();
      if (!row) throw new Error("Failed to save segment");
      return mapRow(row);
    },
    async findSegmentByHash(orgId, hash) {
      const [row] = await db
        .select()
        .from(segments)
        .where(and(eq(segments.orgId, orgId), eq(segments.hash, hash)));
      return row ? mapRow(row) : null;
    },
    async cacheSegment(orgId, visitorId, segmentHash) {
      await db
        .insert(contextCache)
        .values({ orgId, visitorId, segmentHash })
        .onConflictDoUpdate({
          target: [contextCache.orgId, contextCache.visitorId],
          set: { segmentHash },
        });
    },
    async findCachedSegment(orgId, visitorId) {
      const [row] = await db
        .select()
        .from(contextCache)
        .where(and(eq(contextCache.orgId, orgId), eq(contextCache.visitorId, visitorId)));
      return row ? row.segmentHash : null;
    },
    async listSegments(orgId) {
      const rows = await db.select().from(segments).where(eq(segments.orgId, orgId));
      return rows.map(mapRow);
    },
  };
}

function mapRow(row: typeof segments.$inferSelect): SegmentDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    hash: row.hash,
    signals: (row.signals as ContextSignal[]) || [],
    createdAt: row.created_at,
  };
}
