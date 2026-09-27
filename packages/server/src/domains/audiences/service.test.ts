import { describe, expect, it } from "vitest";
import { createActivityTypeRegistry } from "./activity-registry";
import type {
  AssignmentChange,
  AudienceDefinition,
  AudienceDefinitionVersion,
  AudienceStorage,
  DomainActivity,
  ExperienceBinding,
  ExperienceDecisionDimensions,
  ExperienceDecisionRecord,
  ExperienceOutcomeAttribution,
} from "./ports";
import { MAX_AUDIENCE_ATTRIBUTION_WINDOW_MS, MIN_AUDIENCE_LEDGER_RETENTION_MS } from "./ports";
import { createAudienceService } from "./service";

class MemoryStorage implements AudienceStorage {
  definitions = new Map<string, AudienceDefinition>();
  receipts = new Map<string, "pending" | "processed">();
  assignments = new Map<
    string,
    AssignmentChange & { expiresAt: Date | null; revokedAt: Date | null }
  >();
  history = new Set<string>();
  bindings: ExperienceBinding[] = [];
  decisions = new Map<string, ExperienceDecisionRecord>();
  outcomes = new Map<string, { decisionId: string; activityType: string; occurredAt: Date }>();
  async createDefinition(orgId: string, key: string): Promise<AudienceDefinition> {
    if (this.definitions.has(`${orgId}/${key}`)) throw new Error("duplicate");
    const d = {
      id: `${orgId}-${key}`,
      orgId,
      key,
      status: "draft" as const,
      activeVersion: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      versions: [],
    };
    this.definitions.set(`${orgId}/${key}`, d);
    return d;
  }
  async getDefinition(orgId: string, key: string) {
    return this.definitions.get(`${orgId}/${key}`) ?? null;
  }
  async listDefinitions(orgId: string) {
    return [...this.definitions.values()].filter((d) => d.orgId === orgId);
  }
  async createVersion(input: AudienceDefinitionVersion) {
    const d = this.definitions.get(`${input.orgId}/${input.audienceKey}`)!;
    d.versions!.push(input);
    return input;
  }
  async activateVersion(orgId: string, key: string, version: number, at: Date) {
    const d = this.definitions.get(`${orgId}/${key}`)!;
    d.versions!.forEach((v) => {
      if (v.status === "active") v.status = "superseded";
    });
    const v = d.versions!.find((x) => x.version === version)!;
    v.status = "active";
    v.activatedAt = at;
    d.status = "active";
    d.activeVersion = version;
    return v;
  }
  async setStatus(orgId: string, key: string, status: "disabled" | "archived") {
    const d = this.definitions.get(`${orgId}/${key}`);
    if (!d) return null;
    d.status = status;
    return d;
  }
  async createBinding(
    input: Omit<ExperienceBinding, "id" | "version" | "status" | "createdAt" | "activatedAt">,
  ) {
    const row = {
      ...input,
      id: "00000000-0000-4000-8000-000000000001",
      version: this.bindings.length + 1,
      status: "draft" as const,
      createdAt: new Date(),
    };
    this.bindings.push(row);
    return row;
  }
  async listBindings(orgId: string, key: string) {
    return this.bindings.filter((x) => x.orgId === orgId && x.audienceKey === key);
  }
  async activateBinding(orgId: string, key: string, version: number, at: Date) {
    this.bindings.forEach((b) => {
      if (b.orgId === orgId && b.audienceKey === key)
        b.status = b.version === version ? "active" : "superseded";
    });
    const row = this.bindings.find(
      (b) => b.orgId === orgId && b.audienceKey === key && b.version === version,
    )!;
    row.activatedAt = at;
    return row;
  }
  async ensureReceipt(a: DomainActivity) {
    const k = `${a.orgId}/${a.activityId}`;
    const old = this.receipts.get(k);
    if (!old) this.receipts.set(k, "pending");
    return { status: old ?? "pending", inserted: !old };
  }
  async activeVersions(orgId: string) {
    return [...this.definitions.values()]
      .filter((d) => d.orgId === orgId && d.status === "active")
      .flatMap((d) => d.versions!.filter((v) => v.status === "active"));
  }
  async completeActivity(orgId: string, activityId: string, changes: AssignmentChange[]) {
    for (const change of changes) {
      const historyKey = `${orgId}/${activityId}/${change.audienceKey}`;
      if (this.history.has(historyKey)) continue;
      this.history.add(historyKey);
      const key = `${orgId}/${change.userId}/${change.audienceKey}`;
      if (change.action === "assign")
        this.assignments.set(key, { ...change, expiresAt: change.expiresAt, revokedAt: null });
      else {
        const old = this.assignments.get(key);
        if (old) old.revokedAt = change.occurredAt;
      }
    }
    this.receipts.set(`${orgId}/${activityId}`, "processed");
  }
  async getActiveMemberships(orgId: string, userId: string, asOf: Date) {
    return [...this.assignments.values()]
      .filter(
        (x) =>
          x.orgId === orgId &&
          x.userId === userId &&
          x.occurredAt <= asOf &&
          !x.revokedAt &&
          (!x.expiresAt || x.expiresAt > asOf),
      )
      .map(
        ({
          orgId: o,
          userId: u,
          audienceKey,
          activityId,
          definitionVersion,
          occurredAt,
          expiresAt,
          revokedAt,
        }) => ({
          orgId: o,
          userId: u,
          audienceKey,
          sourceActivityId: activityId,
          definitionVersion,
          assignedAt: occurredAt,
          expiresAt,
          revokedAt,
        }),
      );
  }
  async getActiveBindings(orgId: string, key: string) {
    return this.bindings.filter(
      (b) => b.orgId === orgId && b.audienceKey === key && b.status === "active",
    );
  }
  async getExperiencePerformance() {
    return [];
  }
  async insertExperienceDecision(decision: ExperienceDecisionRecord) {
    this.decisions.set(decision.decisionId, decision);
  }
  async cleanupExpiredExperienceDecisions(at: Date) {
    for (const [id, decision] of this.decisions)
      if (decision.expiresAt <= at) this.decisions.delete(id);
    for (const [id, outcome] of this.outcomes)
      if (!this.decisions.has(outcome.decisionId)) this.outcomes.delete(id);
  }
  async markExperienceDecisionRendered(input: {
    orgId: string;
    verifiedUserId: string;
    sessionId: string;
    decisionId: string;
    renderedAt: Date;
  }) {
    const d = this.decisions.get(input.decisionId);
    if (
      !d ||
      d.orgId !== input.orgId ||
      d.verifiedUserId !== input.verifiedUserId ||
      d.sessionId !== input.sessionId
    )
      return null;
    if (!d.renderedAt && d.servedAt <= input.renderedAt && d.renderDeadlineAt >= input.renderedAt) {
      d.renderedAt = input.renderedAt;
      d.expiresAt = new Date(
        Math.max(
          input.renderedAt.getTime() + d.attributionWindowMs,
          d.servedAt.getTime() + MIN_AUDIENCE_LEDGER_RETENTION_MS,
        ),
      );
      return { decision: d, newlyRendered: true };
    }
    if (d.renderedAt && d.renderedAt <= input.renderedAt && d.expiresAt > input.renderedAt)
      return { decision: d, newlyRendered: false };
    return null;
  }
  async attributeTrustedGoal(
    activity: DomainActivity,
    at: Date,
  ): Promise<ExperienceOutcomeAttribution | null> {
    if (!activity.subjectUserId) return null;
    const prior = this.outcomes.get(`${activity.orgId}/${activity.activityId}`);
    if (prior) {
      const d = this.decisions.get(prior.decisionId)!;
      if (
        prior.activityType !== activity.type ||
        prior.occurredAt.getTime() !== activity.occurredAt.getTime() ||
        d.verifiedUserId !== activity.subjectUserId
      )
        throw new Error("Activity ID reused");
      return { ...safeDimensions(d), duplicate: true };
    }
    const match = [...this.decisions.values()]
      .filter(
        (d) =>
          d.orgId === activity.orgId &&
          d.verifiedUserId === activity.subjectUserId &&
          d.goalEvent === activity.type &&
          d.renderedAt &&
          d.renderedAt <= activity.occurredAt &&
          d.renderedAt.getTime() + d.attributionWindowMs > activity.occurredAt.getTime() &&
          d.renderedAt.getTime() + d.attributionWindowMs > at.getTime(),
      )
      .sort(
        (a, b) =>
          b.renderedAt!.getTime() - a.renderedAt!.getTime() ||
          b.servedAt.getTime() - a.servedAt.getTime() ||
          b.decisionId.localeCompare(a.decisionId),
      )[0];
    if (!match) return null;
    this.outcomes.set(`${activity.orgId}/${activity.activityId}`, {
      decisionId: match.decisionId,
      activityType: activity.type,
      occurredAt: activity.occurredAt,
    });
    return { ...safeDimensions(match), duplicate: false };
  }
}

function safeDimensions(d: ExperienceDecisionRecord): ExperienceDecisionDimensions {
  return {
    decisionId: d.decisionId,
    sessionId: d.sessionId,
    audienceKey: d.audienceKey,
    audienceDefinitionVersion: d.audienceDefinitionVersion,
    bindingId: d.bindingId,
    bindingVersion: d.bindingVersion,
    pageKey: d.pageKey,
    locale: d.locale,
    schemaId: d.schemaId,
    variantId: d.variantId,
  };
}
const registry = () => {
  const result = createActivityTypeRegistry();
  result.register({
    type: "sample.order.paid",
    version: 1,
    fields: {
      "order.status": { type: "string", operators: ["equals"] },
      "order.total": { type: "number", operators: ["gte"] },
    },
    validateFacts: (facts): facts is Record<string, unknown> =>
      !!facts &&
      typeof facts === "object" &&
      typeof (facts as any).order?.status === "string" &&
      typeof (facts as any).order?.total === "number",
  });
  result.register({
    type: "sample.membership.revoked",
    version: 1,
    fields: { reason: { type: "string", operators: ["exists"] } },
    validateFacts: (facts): facts is Record<string, unknown> =>
      !!facts && typeof facts === "object",
  });
  return result;
};
const event = (
  activityId: string,
  orgId = "tenant-a",
  occurredAt = new Date("2026-01-01T00:00:00Z"),
  type = "sample.order.paid",
  facts: Record<string, unknown> = { order: { status: "paid", total: 100 } },
): DomainActivity => ({
  orgId,
  activityId,
  type,
  version: 1,
  subjectUserId: "user-1",
  occurredAt,
  facts,
});

async function createRule(
  service: ReturnType<typeof createAudienceService>,
  action: "assign" | "remove" = "assign",
) {
  await service.createDefinition("tenant-a", "buyer", "admin");
  const v = await service.createVersion("tenant-a", "buyer", {
    activityType: action === "assign" ? "sample.order.paid" : "sample.membership.revoked",
    activityVersion: 1,
    condition:
      action === "assign"
        ? {
            all: [
              { field: "order.status", operator: "equals", value: "paid" },
              { field: "order.total", operator: "gte", value: 50 },
            ],
          }
        : { field: "reason", operator: "exists" },
    action,
    expiry: action === "assign" ? { afterMs: 30 * 86400000 } : {},
    createdBy: "admin",
  });
  await service.activateVersion("tenant-a", "buyer", v.version);
}

async function prepareLedger(attributionWindowMs = 60_000) {
  const storage = new MemoryStorage();
  const service = createAudienceService(storage, registry());
  await createRule(service);
  const now = new Date();
  await service.processActivity(
    event(`qualify-${now.getTime()}`, "tenant-a", new Date(now.getTime() - 20_000)),
  );
  const binding = await service.createBinding("tenant-a", "buyer", "admin", {
    pageKey: "/products",
    locale: "en",
    schemaId: "layout-1",
    variantId: "variant-1",
    goalEvent: "sample.order.paid",
    attributionWindowMs,
  });
  await service.activateBinding("tenant-a", "buyer", binding.version);
  const match = await service.resolveExperience(
    "tenant-a",
    "user-1",
    { pageKey: "/products", locale: "en" },
    now,
  );
  if (!match) throw new Error("Expected test membership and binding match");
  return { storage, service, now, match };
}
const sessionA = "11111111-1111-4111-8111-111111111111";
const sessionB = "22222222-2222-4222-8222-222222222222";

describe("audience domain service", () => {
  it("rejects unregistered fields/operators and unregistered activity types", async () => {
    const service = createAudienceService(new MemoryStorage(), registry());
    await service.createDefinition("tenant-a", "buyer", "admin");
    await expect(
      service.createVersion("tenant-a", "buyer", {
        activityType: "sample.order.paid",
        activityVersion: 1,
        condition: { field: "order.secret", operator: "equals", value: "x" },
        action: "assign",
        expiry: { afterMs: 1000 },
        createdBy: "admin",
      }),
    ).rejects.toThrow(/Unregistered rule field/);
    await expect(
      service.createVersion("tenant-a", "buyer", {
        activityType: "sample.order.paid",
        activityVersion: 1,
        condition: { field: "order.status", operator: "gt", value: 2 },
        action: "assign",
        expiry: { afterMs: 1000 },
        createdBy: "admin",
      }),
    ).rejects.toThrow(/Unregistered operator/);
    await expect(
      service.processActivity(event("bad", "tenant-a", new Date(), "unregistered.event")),
    ).rejects.toThrow(/Unregistered activity/);
    await expect(
      service.processActivity(
        event("extra", "tenant-a", new Date(), "sample.order.paid", {
          order: { status: "paid", total: 100, privateNote: "not registered" },
        }),
      ),
    ).rejects.toThrow(/Unregistered or invalid activity fact/);
  });
  it("isolates tenant definitions, activates immutable versions, and expires by trusted occurrence time", async () => {
    const storage = new MemoryStorage();
    const service = createAudienceService(storage, registry());
    await createRule(service);
    expect(await service.listDefinitions("tenant-b")).toEqual([]);
    const d = await service.getDefinition("tenant-a", "buyer");
    expect(d?.activeVersion).toBe(1);
    const occurredAt = new Date("2020-02-01T00:00:00Z");
    await service.processActivity(event("a1", "tenant-a", occurredAt));
    const membership = await service.getActiveMemberships(
      "tenant-a",
      "user-1",
      new Date("2020-02-15T00:00:00Z"),
    );
    expect(membership[0]?.expiresAt?.getTime()).toBe(occurredAt.getTime() + 30 * 86400000);
    expect(
      await service.getActiveMemberships("tenant-a", "user-1", new Date("2020-03-05T00:00:00Z")),
    ).toEqual([]);
    expect(
      await service.getActiveMemberships("tenant-b", "user-1", new Date("2020-02-15T00:00:00Z")),
    ).toEqual([]);
    await expect(
      service.createVersion("tenant-a", "buyer", {
        activityType: "sample.order.paid",
        activityVersion: 1,
        condition: { field: "order.status", operator: "equals", value: "paid" },
        action: "assign",
        expiry: { afterMs: 1000 },
        createdBy: "admin",
      }),
    ).resolves.toMatchObject({ version: 2, status: "draft" });
    expect((await service.getDefinition("tenant-a", "buyer"))?.activeVersion).toBe(1);
  });
  it("deduplicates activity retries, supports revoke and disable", async () => {
    const storage = new MemoryStorage();
    const service = createAudienceService(storage, registry());
    await createRule(service);
    const paid = event("stable-paid-id");
    await service.processActivity(paid);
    expect((await service.processActivity(paid)).duplicate).toBe(true);
    expect(storage.history.size).toBe(1);
    await service.createVersion("tenant-a", "buyer", {
      activityType: "sample.membership.revoked",
      activityVersion: 1,
      condition: { field: "reason", operator: "exists" },
      action: "remove",
      expiry: {},
      createdBy: "admin",
    });
    await service.activateVersion("tenant-a", "buyer", 2);
    await service.processActivity(
      event("revoke-1", "tenant-a", new Date("2026-01-02T00:00:00Z"), "sample.membership.revoked", {
        reason: "requested",
      }),
    );
    expect(
      await service.getActiveMemberships("tenant-a", "user-1", new Date("2026-01-03T00:00:00Z")),
    ).toEqual([]);
    await service.setStatus("tenant-a", "buyer", "disabled", "admin");
    expect((await service.processActivity(event("paid-while-disabled"))).changes).toEqual([]);
  });
  it("supports until-revoked membership only through its registered revocation activity", async () => {
    const service = createAudienceService(new MemoryStorage(), registry());
    await service.createDefinition("tenant-a", "persistent", "admin");
    const v = await service.createVersion("tenant-a", "persistent", {
      activityType: "sample.order.paid",
      activityVersion: 1,
      condition: { field: "order.status", operator: "equals", value: "paid" },
      action: "assign",
      expiry: {
        untilRevoked: true,
        revokedBy: {
          activityType: "sample.membership.revoked",
          activityVersion: 1,
          condition: { field: "reason", operator: "exists" },
        },
      },
      createdBy: "admin",
    });
    await service.activateVersion("tenant-a", "persistent", v.version);
    await service.processActivity(event("persistent-assign"));
    expect(
      (
        await service.getActiveMemberships("tenant-a", "user-1", new Date("2026-01-02T00:00:00Z"))
      )[0]?.expiresAt,
    ).toBeNull();
    await service.processActivity(
      event(
        "persistent-revoke",
        "tenant-a",
        new Date("2026-01-03T00:00:00Z"),
        "sample.membership.revoked",
        { reason: "requested" },
      ),
    );
    expect(
      await service.getActiveMemberships("tenant-a", "user-1", new Date("2026-01-04T00:00:00Z")),
    ).toEqual([]);
    await service.createDefinition("tenant-a", "bad-expiry", "admin");
    await expect(
      service.createVersion("tenant-a", "bad-expiry", {
        activityType: "sample.order.paid",
        activityVersion: 1,
        condition: { field: "order.status", operator: "equals", value: "paid" },
        action: "assign",
        expiry: {
          untilRevoked: true,
          revokedBy: {
            activityType: "unregistered.revoke",
            activityVersion: 1,
            condition: { field: "reason", operator: "exists" },
          },
        },
        createdBy: "admin",
      }),
    ).rejects.toThrow(/Unregistered revocation/);
  });
  it("resolves a compatible active binding without accepting identity from context", async () => {
    const storage = new MemoryStorage();
    const service = createAudienceService(storage, registry());
    await createRule(service);
    await service.processActivity(event("member"));
    const binding = await service.createBinding("tenant-a", "buyer", "admin", {
      pageKey: "/products",
      locale: "en",
      schemaId: "layout-1",
      variantId: "variant-1",
      goalEvent: "sample.order.paid",
      attributionWindowMs: 1000,
    });
    await service.activateBinding("tenant-a", "buyer", binding.version);
    expect(
      await service.resolveExperience(
        "tenant-a",
        "user-1",
        { pageKey: "/products", locale: "en" },
        new Date("2026-01-02T00:00:00Z"),
      ),
    ).toMatchObject({ binding: { variantId: "variant-1" } });
    expect(
      await service.resolveExperience("tenant-a", "other-user", {
        pageKey: "/products",
        locale: "en",
      }),
    ).toBeNull();
    expect(
      await service.resolveExperience("tenant-a", "user-1", {
        pageKey: "/products/2",
        locale: "en",
      }),
    ).toBeNull();
  });
  it("creates only active verified snapshots and rejects unknown, foreign, and expired render decisions", async () => {
    const { storage, service, match, now } = await prepareLedger(2_000);
    await expect(
      service.createExperienceDecision("tenant-a", "user-1", "not-a-uuid", match, now),
    ).rejects.toThrow(/sessionId must be a UUID/);
    const decision = await service.createExperienceDecision(
      "tenant-a",
      "user-1",
      sessionA,
      match,
      now,
    );
    expect(decision).toMatchObject({
      audienceKey: "buyer",
      bindingId: match.binding.id,
      bindingVersion: match.binding.version,
      audienceDefinitionVersion: match.membership.definitionVersion,
      sessionId: sessionA,
    });
    expect(decision).not.toHaveProperty("verifiedUserId");
    expect(decision).not.toHaveProperty("goalEvent");
    expect(
      await service.markExperienceDecisionRendered(
        "tenant-b",
        "user-1",
        sessionA,
        decision.decisionId,
        now,
      ),
    ).toBeNull();
    expect(
      await service.markExperienceDecisionRendered(
        "tenant-a",
        "other-user",
        sessionA,
        decision.decisionId,
        now,
      ),
    ).toBeNull();
    expect(
      await service.markExperienceDecisionRendered(
        "tenant-a",
        "user-1",
        sessionB,
        decision.decisionId,
        now,
      ),
    ).toBeNull();
    expect(
      await service.markExperienceDecisionRendered(
        "tenant-a",
        "user-1",
        sessionA,
        "33333333-3333-4333-8333-333333333333",
        now,
      ),
    ).toBeNull();
    const expired = await service.createExperienceDecision(
      "tenant-a",
      "user-1",
      "44444444-4444-4444-8444-444444444444",
      match,
      new Date(now.getTime() - 10_000),
    );
    expect(
      await service.markExperienceDecisionRendered(
        "tenant-a",
        "user-1",
        expired.sessionId,
        expired.decisionId,
        now,
      ),
    ).toBeNull();
    const foreignMatch = { ...match, membership: { ...match.membership, userId: "other-user" } };
    await expect(
      service.createExperienceDecision("tenant-a", "user-1", sessionB, foreignMatch, now),
    ).rejects.toThrow(/does not match verified/);
    const staleBindingSnapshot = {
      ...match,
      binding: { ...match.binding, status: "active" as const },
    };
    storage.bindings[0]!.status = "superseded";
    await expect(
      service.createExperienceDecision("tenant-a", "user-1", sessionB, staleBindingSnapshot, now),
    ).rejects.toThrow(/no longer active/);
  });
  it("marks rendered once, attributes the latest eligible decision, and deduplicates trusted goals", async () => {
    const { service, match, now } = await prepareLedger(60_000);
    const older = await service.createExperienceDecision(
      "tenant-a",
      "user-1",
      sessionA,
      match,
      new Date(now.getTime() - 5_000),
    );
    const firstRender = await service.markExperienceDecisionRendered(
      "tenant-a",
      "user-1",
      sessionA,
      older.decisionId,
      new Date(now.getTime() - 4_900),
    );
    expect(firstRender?.newlyRendered).toBe(true);
    const repeatRender = await service.markExperienceDecisionRendered(
      "tenant-a",
      "user-1",
      sessionA,
      older.decisionId,
      new Date(now.getTime() - 4_800),
    );
    expect(repeatRender).toMatchObject({
      newlyRendered: false,
      dimensions: { decisionId: older.decisionId },
    });
    const newer = await service.createExperienceDecision(
      "tenant-a",
      "user-1",
      sessionB,
      match,
      new Date(now.getTime() - 3_000),
    );
    await service.markExperienceDecisionRendered(
      "tenant-a",
      "user-1",
      sessionB,
      newer.decisionId,
      new Date(now.getTime() - 2_900),
    );
    const goal = event(`goal-${now.getTime()}`, "tenant-a", new Date(now.getTime() - 1_000));
    const attributed = await service.attributeTrustedGoal(goal);
    expect(attributed).toMatchObject({
      decisionId: newer.decisionId,
      sessionId: sessionB,
      duplicate: false,
    });
    expect(await service.attributeTrustedGoal(goal)).toMatchObject({
      decisionId: newer.decisionId,
      duplicate: true,
    });
    expect(
      await service.attributeTrustedGoal(
        event(
          "wrong-goal",
          "tenant-a",
          new Date(now.getTime() - 1_000),
          "sample.membership.revoked",
          { reason: "x" },
        ),
      ),
    ).toBeNull();
  });
  it("validates goal event registration and attribution windows, and does not attribute outside the rendered window", async () => {
    const { storage, service, match, now } = await prepareLedger(1_000);
    await expect(
      service.createBinding("tenant-a", "buyer", "admin", {
        pageKey: "/products",
        locale: null,
        schemaId: "s",
        variantId: "v",
        goalEvent: "unregistered.goal",
        attributionWindowMs: 1_000,
      }),
    ).rejects.toThrow(/Invalid experience binding/);
    await expect(
      service.createBinding("tenant-a", "buyer", "admin", {
        pageKey: "/products",
        locale: null,
        schemaId: "s",
        variantId: "v",
        goalEvent: "sample.order.paid",
        attributionWindowMs: MAX_AUDIENCE_ATTRIBUTION_WINDOW_MS + 1,
      }),
    ).rejects.toThrow(/Invalid experience binding/);
    const decision = await service.createExperienceDecision(
      "tenant-a",
      "user-1",
      sessionA,
      match,
      new Date(now.getTime() - 5_000),
    );
    const storedDecision = storage.decisions.get(decision.decisionId);
    expect(storedDecision).toBeDefined();
    expect(storedDecision!.expiresAt.getTime()).toBeGreaterThanOrEqual(
      storedDecision!.servedAt.getTime() + MIN_AUDIENCE_LEDGER_RETENTION_MS,
    );
    expect(
      await service.markExperienceDecisionRendered(
        "tenant-a",
        "user-1",
        sessionA,
        decision.decisionId,
        new Date(now.getTime() - 3_000),
      ),
    ).toBeNull();
    expect(
      await service.attributeTrustedGoal(
        event("late-goal", "tenant-a", new Date(now.getTime() - 1_000)),
      ),
    ).toBeNull();
  });
});
