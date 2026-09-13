import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import type {
  EvidenceActivity,
  EvidenceActivityInput,
  EvidenceAuditEvent,
  EvidenceAuditInput,
  EvidenceLink,
  EvidenceLinkInput,
  EvidenceListQuery,
  EvidenceRecord,
  EvidenceRecordInput,
  EvidenceService,
} from "../ports";
import { evidenceActivities, evidenceAuditEvents, evidenceLinks, evidenceRecords } from "../schema";

const MAX_LIMIT = 100;

export function createEvidencePostgresService(db: Database): EvidenceService {
  const assertEndpoint = async (orgId: string, id: string) => {
    const [record] = await db
      .select({ id: evidenceRecords.id })
      .from(evidenceRecords)
      .where(and(eq(evidenceRecords.orgId, orgId), eq(evidenceRecords.id, id)))
      .limit(1);
    if (record) return;
    const [activity] = await db
      .select({ id: evidenceActivities.id })
      .from(evidenceActivities)
      .where(and(eq(evidenceActivities.orgId, orgId), eq(evidenceActivities.id, id)))
      .limit(1);
    if (!activity) throw new Error("evidence link endpoint not found");
  };

  return {
    async appendRecord(input) {
      const [inserted] = await db
        .insert(evidenceRecords)
        .values({
          ...input,
          schemaVersion: input.schemaVersion ?? 1,
          occurredAt: input.occurredAt ?? new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return mapRecord(inserted);
      if (!input.idempotencyKey) throw new Error("evidence record insert conflict");
      const [existing] = await db
        .select()
        .from(evidenceRecords)
        .where(
          and(
            eq(evidenceRecords.orgId, input.orgId),
            eq(evidenceRecords.type, input.type),
            eq(evidenceRecords.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("evidence record insert conflict");
      return mapRecord(existing);
    },

    async appendActivity(input) {
      for (const recordId of [...(input.inputRecordIds ?? []), ...(input.outputRecordIds ?? [])]) {
        await assertEndpoint(input.orgId, recordId);
      }
      const [inserted] = await db
        .insert(evidenceActivities)
        .values({
          ...input,
          inputRecordIds: input.inputRecordIds ?? [],
          outputRecordIds: input.outputRecordIds ?? [],
          data: input.data ?? {},
          occurredAt: input.occurredAt ?? new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return mapActivity(inserted);
      if (!input.idempotencyKey) throw new Error("evidence activity insert conflict");
      const [existing] = await db
        .select()
        .from(evidenceActivities)
        .where(
          and(
            eq(evidenceActivities.orgId, input.orgId),
            eq(evidenceActivities.type, input.type),
            eq(evidenceActivities.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("evidence activity insert conflict");
      return mapActivity(existing);
    },

    async link(input) {
      await assertEndpoint(input.orgId, input.fromId);
      await assertEndpoint(input.orgId, input.toId);
      const [inserted] = await db
        .insert(evidenceLinks)
        .values({ ...input, metadata: input.metadata ?? {} })
        .onConflictDoNothing()
        .returning();
      if (inserted) return mapLink(inserted);
      const [existing] = await db
        .select()
        .from(evidenceLinks)
        .where(
          and(
            eq(evidenceLinks.orgId, input.orgId),
            eq(evidenceLinks.fromId, input.fromId),
            eq(evidenceLinks.toId, input.toId),
            eq(evidenceLinks.relation, input.relation),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("evidence link insert conflict");
      return mapLink(existing);
    },

    async audit(input) {
      const [inserted] = await db
        .insert(evidenceAuditEvents)
        .values({
          ...input,
          metadata: input.metadata ?? {},
          occurredAt: input.occurredAt ?? new Date(),
        })
        .onConflictDoNothing()
        .returning();
      if (inserted) return mapAudit(inserted);
      if (!input.idempotencyKey) throw new Error("evidence audit insert conflict");
      const [existing] = await db
        .select()
        .from(evidenceAuditEvents)
        .where(
          and(
            eq(evidenceAuditEvents.orgId, input.orgId),
            eq(evidenceAuditEvents.action, input.action),
            eq(evidenceAuditEvents.idempotencyKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      if (!existing) throw new Error("evidence audit insert conflict");
      return mapAudit(existing);
    },

    async listRecords(query) {
      const limit = Math.min(Math.max(query.limit ?? 50, 1), MAX_LIMIT);
      const conditions = [eq(evidenceRecords.orgId, query.orgId)];
      if (query.type) conditions.push(eq(evidenceRecords.type, query.type));
      if (query.subjectType) conditions.push(eq(evidenceRecords.subjectType, query.subjectType));
      if (query.subjectId) conditions.push(eq(evidenceRecords.subjectId, query.subjectId));
      const rows = await db
        .select()
        .from(evidenceRecords)
        .where(and(...conditions))
        .orderBy(desc(evidenceRecords.recordedAt))
        .limit(limit);
      return rows.map(mapRecord);
    },

    async listLinks(orgId, recordId) {
      const rows = await db
        .select()
        .from(evidenceLinks)
        .where(
          and(
            eq(evidenceLinks.orgId, orgId),
            // A link is visible from either endpoint.
            // The two queries keep the index usage explicit.
            eq(evidenceLinks.fromId, recordId),
          ),
        );
      const reverse = await db
        .select()
        .from(evidenceLinks)
        .where(and(eq(evidenceLinks.orgId, orgId), eq(evidenceLinks.toId, recordId)));
      return [...rows, ...reverse].map(mapLink);
    },

    async listAudit(orgId, subjectType, subjectId) {
      const conditions = [eq(evidenceAuditEvents.orgId, orgId)];
      if (subjectType) conditions.push(eq(evidenceAuditEvents.subjectType, subjectType));
      if (subjectId) conditions.push(eq(evidenceAuditEvents.subjectId, subjectId));
      const rows = await db
        .select()
        .from(evidenceAuditEvents)
        .where(and(...conditions))
        .orderBy(desc(evidenceAuditEvents.recordedAt))
        .limit(MAX_LIMIT);
      return rows.map(mapAudit);
    },
  };
}

function mapRecord(row: typeof evidenceRecords.$inferSelect): EvidenceRecord {
  return row as EvidenceRecord;
}
function mapActivity(row: typeof evidenceActivities.$inferSelect): EvidenceActivity {
  return row as EvidenceActivity;
}
function mapLink(row: typeof evidenceLinks.$inferSelect): EvidenceLink {
  return row as EvidenceLink;
}
function mapAudit(row: typeof evidenceAuditEvents.$inferSelect): EvidenceAuditEvent {
  return row as EvidenceAuditEvent;
}

export type EvidencePostgresService = ReturnType<typeof createEvidencePostgresService>;
export type {
  EvidenceActivityInput,
  EvidenceAuditInput,
  EvidenceLinkInput,
  EvidenceListQuery,
  EvidenceRecordInput,
};
