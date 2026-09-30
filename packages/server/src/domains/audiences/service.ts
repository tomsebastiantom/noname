import { randomUUID } from "node:crypto";
import { createActivityTypeRegistry } from "./activity-registry";
import type {
  ActivityTypeRegistry,
  AssignmentChange,
  AudienceCondition,
  AudienceExperienceMatch,
  AudienceService,
  AudienceStorage,
  DomainActivity,
  ExperienceBindingInput,
  ExperienceDecisionDimensions,
  ExperienceDecisionRecord,
} from "./ports";
import { MAX_AUDIENCE_ATTRIBUTION_WINDOW_MS, MIN_AUDIENCE_LEDGER_RETENTION_MS } from "./ports";
import { evaluateCondition, validateDefinitionVersion } from "./rules";

export function createAudienceService(
  storage: AudienceStorage,
  activityTypes: ActivityTypeRegistry = createActivityTypeRegistry(),
): AudienceService {
  return {
    activityTypes,
    async createDefinition(orgId, key, actorId) {
      if (!/^[a-z][a-z0-9_-]{1,63}$/.test(key)) throw new Error("Invalid audience key");
      if (!orgId || !actorId) throw new Error("Tenant and actor are required");
      return storage.createDefinition(orgId, key, actorId);
    },
    listDefinitions(orgId) {
      return storage.listDefinitions(orgId);
    },
    getDefinition(orgId, key) {
      return storage.getDefinition(orgId, key);
    },
    async createVersion(orgId, key, input) {
      const definition = await storage.getDefinition(orgId, key);
      if (!definition || definition.status === "archived")
        throw new Error("Audience definition not found or archived");
      validateDefinitionVersion(input, activityTypes);
      const version =
        (definition.versions?.reduce((max, v) => Math.max(max, v.version), 0) ?? 0) + 1;
      return storage.createVersion({
        ...input,
        orgId,
        audienceKey: key,
        version,
        status: "draft",
        createdAt: new Date(),
      });
    },
    async validateVersion(orgId, key, version, sample) {
      const definition = await storage.getDefinition(orgId, key);
      const row = definition?.versions?.find((v) => v.version === version);
      if (!row) throw new Error("Audience definition version not found");
      validateDefinitionVersion(row, activityTypes);
      if (sample) {
        activityTypes.validate(sample);
        if (
          sample.orgId !== orgId ||
          sample.type !== row.activityType ||
          sample.version !== row.activityVersion
        )
          throw new Error("Sample activity does not match definition");
        return {
          valid: true,
          matches: evaluateCondition(
            row.condition,
            sample.facts,
            activityTypes.get(row.activityType, row.activityVersion)?.fields,
          ),
        };
      }
      return { valid: true };
    },
    async activateVersion(orgId, key, version, actorId) {
      const definition = await storage.getDefinition(orgId, key);
      const row = definition?.versions?.find((v) => v.version === version);
      if (row?.status !== "draft") throw new Error("Only a draft version can be activated");
      validateDefinitionVersion(row, activityTypes);
      return storage.activateVersion(orgId, key, version, new Date(), actorId);
    },
    setStatus(orgId, key, status, actorId) {
      return storage.setStatus(orgId, key, status, actorId);
    },
    async createBinding(orgId, key, actorId, input: ExperienceBindingInput) {
      const definition = await storage.getDefinition(orgId, key);
      if (!definition || definition.status === "archived")
        throw new Error("Audience definition not found or archived");
      if (
        !/^\/[a-zA-Z0-9/_-]{0,255}$/.test(input.pageKey) ||
        input.pageKey.includes("//") ||
        input.pageKey.includes("..")
      )
        throw new Error("Invalid normalized page key");
      if (input.locale != null && !/^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(input.locale))
        throw new Error("Invalid locale");
      if (
        !input.schemaId ||
        !input.variantId ||
        !/^[a-z][a-z0-9_.-]{1,127}$/.test(input.goalEvent) ||
        !activityTypes.list().some((activity) => activity.type === input.goalEvent) ||
        !Number.isSafeInteger(input.attributionWindowMs) ||
        input.attributionWindowMs < 1 ||
        input.attributionWindowMs > MAX_AUDIENCE_ATTRIBUTION_WINDOW_MS
      )
        throw new Error("Invalid experience binding");
      return storage.createBinding({ ...input, orgId, audienceKey: key, createdBy: actorId });
    },
    listBindings(orgId, key) {
      return storage.listBindings(orgId, key);
    },
    activateBinding(orgId, key, version, actorId) {
      return storage.activateBinding(orgId, key, version, new Date(), actorId);
    },
    async processActivity(activity: DomainActivity) {
      activityTypes.validate(activity);
      const receipt = await storage.ensureReceipt(activity);
      if (receipt.status === "processed") return { duplicate: true, changes: [] };
      const definitions = await storage.activeVersions(activity.orgId);
      const changes: AssignmentChange[] = [];
      if (activity.subjectUserId) {
        for (const row of definitions) {
          if (
            row.activityType === activity.type &&
            row.activityVersion === activity.version &&
            evaluateCondition(
              row.condition as AudienceCondition,
              activity.facts,
              activityTypes.get(row.activityType, row.activityVersion)?.fields,
            )
          ) {
            const expiresAt =
              row.action === "assign" && "afterMs" in row.expiry
                ? new Date(activity.occurredAt.getTime() + row.expiry.afterMs)
                : null;
            changes.push({
              orgId: activity.orgId,
              userId: activity.subjectUserId,
              audienceKey: row.audienceKey,
              activityId: activity.activityId,
              definitionVersion: row.version,
              action: row.action,
              occurredAt: activity.occurredAt,
              expiresAt,
            });
          }
          if (
            row.action === "assign" &&
            "untilRevoked" in row.expiry &&
            row.expiry.untilRevoked &&
            row.expiry.revokedBy.activityType === activity.type &&
            row.expiry.revokedBy.activityVersion === activity.version &&
            evaluateCondition(
              row.expiry.revokedBy.condition,
              activity.facts,
              activityTypes.get(
                row.expiry.revokedBy.activityType,
                row.expiry.revokedBy.activityVersion,
              )?.fields,
            )
          ) {
            changes.push({
              orgId: activity.orgId,
              userId: activity.subjectUserId,
              audienceKey: row.audienceKey,
              activityId: activity.activityId,
              definitionVersion: row.version,
              action: "remove",
              occurredAt: activity.occurredAt,
              expiresAt: null,
            });
          }
        }
      }
      await storage.completeActivity(activity.orgId, activity.activityId, changes, new Date());
      return { duplicate: false, changes };
    },
    getActiveMemberships(orgId, userId, asOf = new Date()) {
      return storage.getActiveMemberships(orgId, userId, asOf);
    },
    getExperiencePerformance(filters) {
      return storage.getExperiencePerformance(filters);
    },
    async resolveExperience(orgId, userId, context, asOf = new Date()) {
      const memberships = await storage.getActiveMemberships(orgId, userId, asOf);
      const matches = (
        await Promise.all(
          memberships.map(async (membership) => {
            const bindings = await storage.getActiveBindings(orgId, membership.audienceKey);
            return bindings
              .filter(
                (binding) =>
                  binding.pageKey === context.pageKey &&
                  (binding.locale === null || binding.locale === context.locale),
              )
              .map((binding) => ({ membership, binding }));
          }),
        )
      ).flat();
      matches.sort(
        (a, b) =>
          Number(b.binding.locale === context.locale) -
            Number(a.binding.locale === context.locale) ||
          b.binding.version - a.binding.version ||
          a.binding.audienceKey.localeCompare(b.binding.audienceKey),
      );
      return matches[0] ?? null;
    },
    async createExperienceDecision(
      orgId,
      verifiedUserId,
      sessionId,
      match: AudienceExperienceMatch,
      servedAt = new Date(),
    ) {
      assertUuid(sessionId, "sessionId");
      if (!orgId || !verifiedUserId || !validDate(servedAt))
        throw new Error("Verified user and valid serve time are required");
      if (
        match.membership.orgId !== orgId ||
        match.membership.userId !== verifiedUserId ||
        match.binding.orgId !== orgId ||
        match.binding.audienceKey !== match.membership.audienceKey ||
        match.binding.status !== "active"
      )
        throw new Error("Resolved experience does not match verified tenant membership");
      const [memberships, bindings] = await Promise.all([
        storage.getActiveMemberships(orgId, verifiedUserId, servedAt),
        storage.getActiveBindings(orgId, match.membership.audienceKey),
      ]);
      const currentMembership = memberships.find(
        (item) =>
          item.audienceKey === match.membership.audienceKey &&
          item.sourceActivityId === match.membership.sourceActivityId &&
          item.definitionVersion === match.membership.definitionVersion,
      );
      const currentBinding = bindings.find(
        (item) =>
          item.id === match.binding.id &&
          item.version === match.binding.version &&
          item.status === "active",
      );
      if (!currentMembership || !currentBinding)
        throw new Error("Resolved membership or binding is no longer active");
      assertUuid(currentBinding.id, "bindingId");
      await storage.cleanupExpiredExperienceDecisions(new Date());
      const renderDeadlineAt = new Date(servedAt.getTime() + currentBinding.attributionWindowMs);
      const decision: ExperienceDecisionRecord = {
        decisionId: randomUUID(),
        orgId,
        verifiedUserId,
        sessionId,
        audienceKey: currentMembership.audienceKey,
        audienceDefinitionVersion: currentMembership.definitionVersion,
        bindingId: currentBinding.id,
        bindingVersion: currentBinding.version,
        pageKey: currentBinding.pageKey,
        locale: currentBinding.locale ?? null,
        schemaId: currentBinding.schemaId,
        variantId: currentBinding.variantId,
        goalEvent: currentBinding.goalEvent,
        attributionWindowMs: currentBinding.attributionWindowMs,
        servedAt,
        renderedAt: null,
        renderDeadlineAt,
        expiresAt: new Date(
          Math.max(
            renderDeadlineAt.getTime(),
            servedAt.getTime() + MIN_AUDIENCE_LEDGER_RETENTION_MS,
          ),
        ),
      };
      await storage.insertExperienceDecision(decision);
      return decisionDimensions(decision);
    },
    async markExperienceDecisionRendered(
      orgId,
      verifiedUserId,
      sessionId,
      decisionId,
      renderedAt = new Date(),
    ) {
      assertUuid(sessionId, "sessionId");
      assertUuid(decisionId, "decisionId");
      if (!orgId || !verifiedUserId || !validDate(renderedAt))
        throw new Error("Verified user and valid render time are required");
      await storage.cleanupExpiredExperienceDecisions(new Date());
      const decision = await storage.markExperienceDecisionRendered({
        orgId,
        verifiedUserId,
        sessionId,
        decisionId,
        renderedAt,
      });
      return decision
        ? {
            dimensions: decisionDimensions(decision.decision),
            newlyRendered: decision.newlyRendered,
          }
        : null;
    },
    async attributeTrustedGoal(activity) {
      activityTypes.validate(activity);
      if (!activity.subjectUserId) return null;
      const now = new Date();
      if (activity.occurredAt.getTime() > now.getTime()) return null;
      await storage.cleanupExpiredExperienceDecisions(now);
      return storage.attributeTrustedGoal(activity, now);
    },
    getActiveBindings(orgId, key) {
      return storage.getActiveBindings(orgId, key);
    },
  };
}

function assertUuid(value: string, field: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    throw new Error(`${field} must be a UUID`);
}
function validDate(value: Date): boolean {
  return value instanceof Date && Number.isFinite(value.getTime());
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
