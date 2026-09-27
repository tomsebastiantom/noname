import { and, desc, eq, gt, gte, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import { StorageError } from "../../../shared/domain-error";
import type {
  AudienceDefinition,
  AudienceDefinitionVersion,
  AudienceExperiencePerformanceBinding,
  AudienceExperiencePerformanceFilters,
  AudienceExpiry,
  AudienceStorage,
  DomainActivity,
  ExperienceBinding,
  ExperienceDecisionDimensions,
  ExperienceDecisionRecord,
} from "../ports";
import { MIN_AUDIENCE_LEDGER_RETENTION_MS } from "../ports";
import {
  audienceActivityReceipts,
  audienceAssignmentHistory,
  audienceAssignments,
  audienceAuditLog,
  audienceDefinitions,
  audienceDefinitionVersions,
  audienceExperienceBindings,
  audienceExperienceDecisions,
  audienceExperienceOutcomes,
} from "../schema";

export function createPostgresAudienceStorage(db: Database): AudienceStorage {
  return {
    async createDefinition(orgId, key, actorId) {
      const [row] = await db.insert(audienceDefinitions).values({ orgId, key }).returning();
      if (!row) throw new StorageError("Failed to create audience");
      await audit(db, orgId, actorId, key, "definition.created", null);
      return mapDefinition(row);
    },
    async getDefinition(orgId, key) {
      const [row] = await db
        .select()
        .from(audienceDefinitions)
        .where(and(eq(audienceDefinitions.orgId, orgId), eq(audienceDefinitions.key, key)))
        .limit(1);
      if (!row) return null;
      const versions = await db
        .select()
        .from(audienceDefinitionVersions)
        .where(
          and(
            eq(audienceDefinitionVersions.orgId, orgId),
            eq(audienceDefinitionVersions.audienceKey, key),
          ),
        );
      return { ...mapDefinition(row), versions: versions.map(mapVersion) };
    },
    async listDefinitions(orgId) {
      const rows = await db
        .select()
        .from(audienceDefinitions)
        .where(eq(audienceDefinitions.orgId, orgId));
      return Promise.all(
        rows.map(async (row) => {
          const versions = await db
            .select()
            .from(audienceDefinitionVersions)
            .where(
              and(
                eq(audienceDefinitionVersions.orgId, orgId),
                eq(audienceDefinitionVersions.audienceKey, row.key),
              ),
            );
          return { ...mapDefinition(row), versions: versions.map(mapVersion) };
        }),
      );
    },
    async createVersion(input) {
      const [row] = await db
        .insert(audienceDefinitionVersions)
        .values({ ...input, condition: input.condition, expiry: input.expiry })
        .returning();
      if (!row) throw new StorageError("Failed to create audience version");
      await audit(
        db,
        input.orgId,
        input.createdBy,
        input.audienceKey,
        "version.created",
        input.version,
      );
      return mapVersion(row);
    },
    async activateVersion(orgId, key, version, at, actorId = "system") {
      const row = await db.transaction(async (tx) => {
        const [draft] = await tx
          .select()
          .from(audienceDefinitionVersions)
          .where(
            and(
              eq(audienceDefinitionVersions.orgId, orgId),
              eq(audienceDefinitionVersions.audienceKey, key),
              eq(audienceDefinitionVersions.version, version),
              eq(audienceDefinitionVersions.status, "draft"),
            ),
          )
          .limit(1);
        if (!draft) throw new StorageError("Audience draft version not found");
        await tx
          .update(audienceDefinitionVersions)
          .set({ status: "superseded" })
          .where(
            and(
              eq(audienceDefinitionVersions.orgId, orgId),
              eq(audienceDefinitionVersions.audienceKey, key),
              eq(audienceDefinitionVersions.status, "active"),
            ),
          );
        const [activated] = await tx
          .update(audienceDefinitionVersions)
          .set({ status: "active", activatedAt: at })
          .where(
            and(
              eq(audienceDefinitionVersions.orgId, orgId),
              eq(audienceDefinitionVersions.audienceKey, key),
              eq(audienceDefinitionVersions.version, version),
              eq(audienceDefinitionVersions.status, "draft"),
            ),
          )
          .returning();
        if (!activated) throw new StorageError("Audience draft version not found");
        await tx
          .update(audienceDefinitions)
          .set({ activeVersion: version, status: "active", updatedAt: at })
          .where(and(eq(audienceDefinitions.orgId, orgId), eq(audienceDefinitions.key, key)));
        await tx.insert(audienceAuditLog).values({
          orgId,
          actorUserId: actorId,
          audienceKey: key,
          action: "version.activated",
          version,
          metadata: {},
        });
        return activated;
      });
      return mapVersion(row);
    },
    async setStatus(orgId, key, status, actorId) {
      const [row] = await db
        .update(audienceDefinitions)
        .set({ status, updatedAt: new Date() })
        .where(and(eq(audienceDefinitions.orgId, orgId), eq(audienceDefinitions.key, key)))
        .returning();
      if (!row) return null;
      await audit(
        db,
        orgId,
        actorId,
        key,
        status === "disabled" ? "definition.disabled" : "definition.archived",
        null,
      );
      return mapDefinition(row);
    },
    async createBinding(input) {
      const existing = await db
        .select({ version: audienceExperienceBindings.version })
        .from(audienceExperienceBindings)
        .where(
          and(
            eq(audienceExperienceBindings.orgId, input.orgId),
            eq(audienceExperienceBindings.audienceKey, input.audienceKey),
          ),
        );
      const version = existing.reduce((max, row) => Math.max(max, row.version), 0) + 1;
      const [row] = await db
        .insert(audienceExperienceBindings)
        .values({ ...input, version })
        .returning();
      if (!row) throw new StorageError("Failed to create audience binding");
      await audit(db, input.orgId, input.createdBy, input.audienceKey, "binding.created", version);
      return mapBinding(row);
    },
    async listBindings(orgId, key) {
      const rows = await db
        .select()
        .from(audienceExperienceBindings)
        .where(
          and(
            eq(audienceExperienceBindings.orgId, orgId),
            eq(audienceExperienceBindings.audienceKey, key),
          ),
        );
      return rows.map(mapBinding);
    },
    async activateBinding(orgId, key, version, at, actorId = "system") {
      const row = await db.transaction(async (tx) => {
        const [draft] = await tx
          .select()
          .from(audienceExperienceBindings)
          .where(
            and(
              eq(audienceExperienceBindings.orgId, orgId),
              eq(audienceExperienceBindings.audienceKey, key),
              eq(audienceExperienceBindings.version, version),
              eq(audienceExperienceBindings.status, "draft"),
            ),
          )
          .limit(1);
        if (!draft) throw new StorageError("Audience binding draft not found");
        await tx
          .update(audienceExperienceBindings)
          .set({ status: "superseded" })
          .where(
            and(
              eq(audienceExperienceBindings.orgId, orgId),
              eq(audienceExperienceBindings.audienceKey, key),
              eq(audienceExperienceBindings.status, "active"),
            ),
          );
        const [active] = await tx
          .update(audienceExperienceBindings)
          .set({ status: "active", activatedAt: at })
          .where(
            and(
              eq(audienceExperienceBindings.orgId, orgId),
              eq(audienceExperienceBindings.audienceKey, key),
              eq(audienceExperienceBindings.version, version),
              eq(audienceExperienceBindings.status, "draft"),
            ),
          )
          .returning();
        if (!active) throw new StorageError("Audience binding draft not found");
        await tx.insert(audienceAuditLog).values({
          orgId,
          actorUserId: actorId,
          audienceKey: key,
          action: "binding.activated",
          version,
          metadata: {},
        });
        return active;
      });
      return mapBinding(row);
    },
    async ensureReceipt(activity: DomainActivity) {
      const [inserted] = await db
        .insert(audienceActivityReceipts)
        .values({
          orgId: activity.orgId,
          activityId: activity.activityId,
          activityType: activity.type,
          activityVersion: activity.version,
          subjectUserId: activity.subjectUserId ?? null,
          occurredAt: activity.occurredAt,
          facts: activity.facts,
          status: "pending",
        })
        .onConflictDoNothing({
          target: [audienceActivityReceipts.orgId, audienceActivityReceipts.activityId],
        })
        .returning();
      const [row] = await db
        .select()
        .from(audienceActivityReceipts)
        .where(
          and(
            eq(audienceActivityReceipts.orgId, activity.orgId),
            eq(audienceActivityReceipts.activityId, activity.activityId),
          ),
        )
        .limit(1);
      if (!row) throw new StorageError("Activity receipt unavailable");
      if (
        row.activityType !== activity.type ||
        row.activityVersion !== activity.version ||
        row.occurredAt.getTime() !== activity.occurredAt.getTime() ||
        (row.status === "pending" &&
          (row.subjectUserId !== (activity.subjectUserId ?? null) ||
            stableJson(row.facts) !== stableJson(activity.facts)))
      )
        throw new Error("Activity ID was reused with different payload");
      return { status: row.status as "pending" | "processed", inserted: !!inserted };
    },
    async activeVersions(orgId) {
      const rows = await db
        .select()
        .from(audienceDefinitionVersions)
        .innerJoin(
          audienceDefinitions,
          and(
            eq(audienceDefinitions.orgId, audienceDefinitionVersions.orgId),
            eq(audienceDefinitions.key, audienceDefinitionVersions.audienceKey),
          ),
        )
        .where(
          and(
            eq(audienceDefinitionVersions.orgId, orgId),
            eq(audienceDefinitionVersions.status, "active"),
            eq(audienceDefinitions.status, "active"),
          ),
        );
      return rows.map((row) => mapVersion(row.audience_definition_versions));
    },
    async completeActivity(orgId, activityId, changes, at) {
      await db.transaction(async (tx) => {
        for (const change of changes) {
          if (change.action === "assign") {
            await tx
              .insert(audienceAssignments)
              .values({
                orgId: change.orgId,
                userId: change.userId,
                audienceKey: change.audienceKey,
                sourceActivityId: change.activityId,
                definitionVersion: change.definitionVersion,
                assignedAt: change.occurredAt,
                expiresAt: change.expiresAt,
                revokedAt: null,
                updatedAt: at,
              })
              .onConflictDoUpdate({
                target: [
                  audienceAssignments.orgId,
                  audienceAssignments.userId,
                  audienceAssignments.audienceKey,
                ],
                set: {
                  sourceActivityId: sql`CASE WHEN ${audienceAssignments.assignedAt} <= ${change.occurredAt} THEN ${change.activityId} ELSE ${audienceAssignments.sourceActivityId} END`,
                  definitionVersion: sql`CASE WHEN ${audienceAssignments.assignedAt} <= ${change.occurredAt} THEN ${change.definitionVersion} ELSE ${audienceAssignments.definitionVersion} END`,
                  assignedAt: sql`GREATEST(${audienceAssignments.assignedAt}, ${change.occurredAt})`,
                  expiresAt: sql`CASE WHEN ${audienceAssignments.assignedAt} <= ${change.occurredAt} THEN ${change.expiresAt} ELSE ${audienceAssignments.expiresAt} END`,
                  revokedAt: sql`CASE WHEN ${audienceAssignments.assignedAt} <= ${change.occurredAt} THEN NULL ELSE ${audienceAssignments.revokedAt} END`,
                  updatedAt: at,
                },
              });
          } else {
            await tx
              .update(audienceAssignments)
              .set({ revokedAt: change.occurredAt, updatedAt: at })
              .where(
                and(
                  eq(audienceAssignments.orgId, change.orgId),
                  eq(audienceAssignments.userId, change.userId),
                  eq(audienceAssignments.audienceKey, change.audienceKey),
                  isNull(audienceAssignments.revokedAt),
                  lte(audienceAssignments.assignedAt, change.occurredAt),
                ),
              );
          }
          await tx
            .insert(audienceAssignmentHistory)
            .values({
              orgId: change.orgId,
              userId: change.userId,
              audienceKey: change.audienceKey,
              activityId: change.activityId,
              definitionVersion: change.definitionVersion,
              action: change.action,
              occurredAt: change.occurredAt,
              expiresAt: change.expiresAt,
            })
            .onConflictDoNothing({
              target: [
                audienceAssignmentHistory.orgId,
                audienceAssignmentHistory.activityId,
                audienceAssignmentHistory.audienceKey,
              ],
            });
        }
        await tx
          .update(audienceActivityReceipts)
          .set({ status: "processed", processedAt: at, subjectUserId: null, facts: {} })
          .where(
            and(
              eq(audienceActivityReceipts.orgId, orgId),
              eq(audienceActivityReceipts.activityId, activityId),
            ),
          );
      });
    },
    async getActiveMemberships(orgId, userId, asOf) {
      const rows = await db
        .select()
        .from(audienceAssignments)
        .where(
          and(
            eq(audienceAssignments.orgId, orgId),
            eq(audienceAssignments.userId, userId),
            lte(audienceAssignments.assignedAt, asOf),
            isNull(audienceAssignments.revokedAt),
            or(isNull(audienceAssignments.expiresAt), gt(audienceAssignments.expiresAt, asOf)),
          ),
        );
      return rows.map((row) => ({
        orgId: row.orgId,
        userId: row.userId,
        audienceKey: row.audienceKey,
        sourceActivityId: row.sourceActivityId,
        definitionVersion: row.definitionVersion,
        assignedAt: row.assignedAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
      }));
    },
    async getActiveBindings(orgId, key) {
      const rows = await db
        .select()
        .from(audienceExperienceBindings)
        .where(
          and(
            eq(audienceExperienceBindings.orgId, orgId),
            eq(audienceExperienceBindings.audienceKey, key),
            eq(audienceExperienceBindings.status, "active"),
          ),
        );
      return rows.map(mapBinding);
    },
    async getExperiencePerformance(
      filters: AudienceExperiencePerformanceFilters,
    ): Promise<AudienceExperiencePerformanceBinding[]> {
      const servedInRange = and(
        gte(audienceExperienceDecisions.servedAt, filters.from),
        lte(audienceExperienceDecisions.servedAt, filters.to),
      );
      const renderedInCohort = and(
        isNotNull(audienceExperienceDecisions.renderedAt),
        lte(audienceExperienceDecisions.renderedAt, filters.to),
      );
      const outcomeInRange = and(
        gte(audienceExperienceOutcomes.occurredAt, filters.from),
        lte(audienceExperienceOutcomes.occurredAt, filters.to),
      );
      const goalAttributionDeadline = sql`${audienceExperienceDecisions.renderedAt} + (${audienceExperienceDecisions.attributionWindowMs} * interval '1 millisecond')`;
      const rows = await db
        .select({
          audienceDefinitionVersion: audienceExperienceDecisions.audienceDefinitionVersion,
          bindingId: audienceExperienceDecisions.bindingId,
          bindingVersion: audienceExperienceDecisions.bindingVersion,
          servedDecisionCount: sql<number>`count(distinct ${audienceExperienceDecisions.decisionId})`,
          renderedDecisionCount: sql<number>`count(distinct case when ${renderedInCohort} then ${audienceExperienceDecisions.decisionId} end)`,
          exposedAccountCount: sql<number>`count(distinct case when ${renderedInCohort} then ${audienceExperienceDecisions.verifiedUserId} end)`,
          outcomeAccountCount: sql<number>`count(distinct case when ${renderedInCohort} and ${outcomeInRange} and ${audienceExperienceOutcomes.activityType} = ${audienceExperienceDecisions.goalEvent} and ${audienceExperienceOutcomes.occurredAt} >= ${audienceExperienceDecisions.renderedAt} and ${audienceExperienceOutcomes.occurredAt} < ${goalAttributionDeadline} then ${audienceExperienceDecisions.verifiedUserId} end)`,
        })
        .from(audienceExperienceDecisions)
        .leftJoin(
          audienceExperienceOutcomes,
          and(
            eq(audienceExperienceOutcomes.orgId, audienceExperienceDecisions.orgId),
            eq(audienceExperienceOutcomes.decisionId, audienceExperienceDecisions.decisionId),
          ),
        )
        .where(
          and(
            eq(audienceExperienceDecisions.orgId, filters.orgId),
            eq(audienceExperienceDecisions.audienceKey, filters.audienceKey),
            servedInRange,
          ),
        )
        .groupBy(
          audienceExperienceDecisions.audienceDefinitionVersion,
          audienceExperienceDecisions.bindingId,
          audienceExperienceDecisions.bindingVersion,
        );
      return rows.map((row) => ({
        audienceDefinitionVersion: row.audienceDefinitionVersion,
        bindingId: row.bindingId,
        bindingVersion: row.bindingVersion,
        servedDecisionCount: Number(row.servedDecisionCount),
        renderedDecisionCount: Number(row.renderedDecisionCount),
        exposedAccountCount: Number(row.exposedAccountCount),
        outcomeAccountCount: Number(row.outcomeAccountCount),
      }));
    },
    async insertExperienceDecision(decision) {
      await db.insert(audienceExperienceDecisions).values(decision);
    },
    async cleanupExpiredExperienceDecisions(at) {
      // Expired decisions cascade-delete their outcome joins. This bounded cleanup runs on ledger reads/writes.
      await db
        .delete(audienceExperienceDecisions)
        .where(lte(audienceExperienceDecisions.expiresAt, at));
    },
    async markExperienceDecisionRendered(input) {
      const [updated] = await db
        .update(audienceExperienceDecisions)
        .set({
          renderedAt: input.renderedAt,
          expiresAt: sql`GREATEST(
            ${input.renderedAt} + (${audienceExperienceDecisions.attributionWindowMs} * interval '1 millisecond'),
            ${audienceExperienceDecisions.servedAt} + (${MIN_AUDIENCE_LEDGER_RETENTION_MS} * interval '1 millisecond')
          )`,
        })
        .where(
          and(
            eq(audienceExperienceDecisions.orgId, input.orgId),
            eq(audienceExperienceDecisions.verifiedUserId, input.verifiedUserId),
            eq(audienceExperienceDecisions.sessionId, input.sessionId),
            eq(audienceExperienceDecisions.decisionId, input.decisionId),
            isNull(audienceExperienceDecisions.renderedAt),
            lte(audienceExperienceDecisions.servedAt, input.renderedAt),
            gte(audienceExperienceDecisions.renderDeadlineAt, input.renderedAt),
          ),
        )
        .returning();
      if (updated) return { decision: mapExperienceDecision(updated), newlyRendered: true };
      const [existing] = await db
        .select()
        .from(audienceExperienceDecisions)
        .where(
          and(
            eq(audienceExperienceDecisions.orgId, input.orgId),
            eq(audienceExperienceDecisions.verifiedUserId, input.verifiedUserId),
            eq(audienceExperienceDecisions.sessionId, input.sessionId),
            eq(audienceExperienceDecisions.decisionId, input.decisionId),
            isNotNull(audienceExperienceDecisions.renderedAt),
            lte(audienceExperienceDecisions.renderedAt, input.renderedAt),
            gt(audienceExperienceDecisions.expiresAt, input.renderedAt),
          ),
        )
        .limit(1);
      return existing ? { decision: mapExperienceDecision(existing), newlyRendered: false } : null;
    },
    async attributeTrustedGoal(activity, at) {
      const userId = activity.subjectUserId;
      if (!userId) return null;
      const goalAttributionDeadline = sql`${audienceExperienceDecisions.renderedAt} + (${audienceExperienceDecisions.attributionWindowMs} * interval '1 millisecond')`;
      return db.transaction(async (tx) => {
        const [prior] = await tx
          .select()
          .from(audienceExperienceOutcomes)
          .innerJoin(
            audienceExperienceDecisions,
            and(
              eq(audienceExperienceDecisions.decisionId, audienceExperienceOutcomes.decisionId),
              eq(audienceExperienceDecisions.orgId, audienceExperienceOutcomes.orgId),
            ),
          )
          .where(
            and(
              eq(audienceExperienceOutcomes.orgId, activity.orgId),
              eq(audienceExperienceOutcomes.activityId, activity.activityId),
            ),
          )
          .limit(1);
        if (prior) {
          const decision = prior.audience_experience_decisions;
          if (
            prior.audience_experience_outcomes.activityType !== activity.type ||
            prior.audience_experience_outcomes.occurredAt.getTime() !==
              activity.occurredAt.getTime() ||
            decision.verifiedUserId !== userId
          )
            throw new Error("Activity ID was reused with different attribution payload");
          return { ...decisionDimensions(mapExperienceDecision(decision)), duplicate: true };
        }
        const [candidate] = await tx
          .select()
          .from(audienceExperienceDecisions)
          .where(
            and(
              eq(audienceExperienceDecisions.orgId, activity.orgId),
              eq(audienceExperienceDecisions.verifiedUserId, userId),
              eq(audienceExperienceDecisions.goalEvent, activity.type),
              isNotNull(audienceExperienceDecisions.renderedAt),
              lte(audienceExperienceDecisions.renderedAt, activity.occurredAt),
              gt(goalAttributionDeadline, activity.occurredAt),
              gt(goalAttributionDeadline, at),
            ),
          )
          .orderBy(
            desc(audienceExperienceDecisions.renderedAt),
            desc(audienceExperienceDecisions.servedAt),
            desc(audienceExperienceDecisions.decisionId),
          )
          .limit(1);
        if (!candidate) return null;
        const [inserted] = await tx
          .insert(audienceExperienceOutcomes)
          .values({
            orgId: activity.orgId,
            activityId: activity.activityId,
            decisionId: candidate.decisionId,
            activityType: activity.type,
            occurredAt: activity.occurredAt,
            expiresAt: candidate.expiresAt,
          })
          .onConflictDoNothing({
            target: [audienceExperienceOutcomes.orgId, audienceExperienceOutcomes.activityId],
          })
          .returning();
        if (inserted)
          return { ...decisionDimensions(mapExperienceDecision(candidate)), duplicate: false };
        const [raced] = await tx
          .select()
          .from(audienceExperienceOutcomes)
          .innerJoin(
            audienceExperienceDecisions,
            and(
              eq(audienceExperienceDecisions.decisionId, audienceExperienceOutcomes.decisionId),
              eq(audienceExperienceDecisions.orgId, audienceExperienceOutcomes.orgId),
            ),
          )
          .where(
            and(
              eq(audienceExperienceOutcomes.orgId, activity.orgId),
              eq(audienceExperienceOutcomes.activityId, activity.activityId),
            ),
          )
          .limit(1);
        if (!raced) return null;
        const racedDecision = raced.audience_experience_decisions;
        if (
          raced.audience_experience_outcomes.activityType !== activity.type ||
          raced.audience_experience_outcomes.occurredAt.getTime() !==
            activity.occurredAt.getTime() ||
          racedDecision.verifiedUserId !== userId
        )
          throw new Error("Activity ID was reused with different attribution payload");
        return { ...decisionDimensions(mapExperienceDecision(racedDecision)), duplicate: true };
      });
    },
  };
}

async function audit(
  db: Database,
  orgId: string,
  actorId: string,
  key: string,
  action: string,
  version: number | null,
) {
  await db
    .insert(audienceAuditLog)
    .values({ orgId, actorUserId: actorId, audienceKey: key, action, version, metadata: {} });
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "undefined";
}
function mapExperienceDecision(
  row: typeof audienceExperienceDecisions.$inferSelect,
): ExperienceDecisionRecord {
  return {
    decisionId: row.decisionId,
    orgId: row.orgId,
    verifiedUserId: row.verifiedUserId,
    sessionId: row.sessionId,
    audienceKey: row.audienceKey,
    audienceDefinitionVersion: row.audienceDefinitionVersion,
    bindingId: row.bindingId,
    bindingVersion: row.bindingVersion,
    pageKey: row.pageKey,
    locale: row.locale,
    schemaId: row.schemaId,
    variantId: row.variantId,
    goalEvent: row.goalEvent,
    attributionWindowMs: row.attributionWindowMs,
    servedAt: row.servedAt,
    renderedAt: row.renderedAt,
    renderDeadlineAt: row.renderDeadlineAt,
    expiresAt: row.expiresAt,
  };
}
function decisionDimensions(decision: ExperienceDecisionRecord): ExperienceDecisionDimensions {
  return {
    decisionId: decision.decisionId,
    sessionId: decision.sessionId,
    audienceKey: decision.audienceKey,
    audienceDefinitionVersion: decision.audienceDefinitionVersion,
    bindingId: decision.bindingId,
    bindingVersion: decision.bindingVersion,
    pageKey: decision.pageKey,
    locale: decision.locale,
    schemaId: decision.schemaId,
    variantId: decision.variantId,
  };
}
function mapDefinition(row: typeof audienceDefinitions.$inferSelect): AudienceDefinition {
  return {
    id: row.id,
    orgId: row.orgId,
    key: row.key,
    status: row.status as AudienceDefinition["status"],
    activeVersion: row.activeVersion,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
function mapVersion(
  row: typeof audienceDefinitionVersions.$inferSelect,
): AudienceDefinitionVersion {
  return {
    orgId: row.orgId,
    audienceKey: row.audienceKey,
    version: row.version,
    activityType: row.activityType,
    activityVersion: row.activityVersion,
    condition: row.condition as AudienceDefinitionVersion["condition"],
    action: row.action as "assign" | "remove",
    expiry: row.expiry as AudienceExpiry,
    status: row.status as AudienceDefinitionVersion["status"],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
  };
}
function mapBinding(row: typeof audienceExperienceBindings.$inferSelect): ExperienceBinding {
  return {
    id: row.id,
    orgId: row.orgId,
    audienceKey: row.audienceKey,
    version: row.version,
    pageKey: row.pageKey,
    locale: row.locale,
    schemaId: row.schemaId,
    variantId: row.variantId,
    goalEvent: row.goalEvent,
    attributionWindowMs: row.attributionWindowMs,
    status: row.status as ExperienceBinding["status"],
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    activatedAt: row.activatedAt,
  };
}
