import { and, eq } from "drizzle-orm";
import { segments, contextCache } from "../schema";
import type { ContextSignal, ContextStorage, SegmentDTO } from "../ports";
import type { Database } from "../../../drizzle";

export function createPostgresContextAdapter(db: Database): ContextStorage {
  return {
    async saveSegment(tenantId, hash, signals) {
      const [row] = await db
        .insert(segments)
        .values({ tenantId, hash, signals })
        .onConflictDoUpdate({ target: [segments.tenantId, segments.hash], set: { signals } })
        .returning();
      if (!row) throw new Error("Failed to save segment");
      return mapRow(row);
    },
    async findSegmentByHash(tenantId, hash) {
      const [row] = await db
        .select()
        .from(segments)
        .where(and(eq(segments.tenantId, tenantId), eq(segments.hash, hash)));
      return row ? mapRow(row) : null;
    },
    async cacheSegment(tenantId, visitorId, segmentHash) {
      await db
        .insert(contextCache)
        .values({ tenantId, visitorId, segmentHash })
        .onConflictDoUpdate({
          target: [contextCache.tenantId, contextCache.visitorId],
          set: { segmentHash },
        });
    },
    async findCachedSegment(tenantId, visitorId) {
      const [row] = await db
        .select()
        .from(contextCache)
        .where(and(eq(contextCache.tenantId, tenantId), eq(contextCache.visitorId, visitorId)));
      return row ? row.segmentHash : null;
    },
    async listSegments(tenantId) {
      const rows = await db.select().from(segments).where(eq(segments.tenantId, tenantId));
      return rows.map(mapRow);
    },
  };
}

function mapRow(row: typeof segments.$inferSelect): SegmentDTO {
  return {
    id: row.id,
    tenantId: row.tenantId,
    hash: row.hash,
    signals: (row.signals as ContextSignal[]) || [],
    createdAt: row.created_at,
  };
}
