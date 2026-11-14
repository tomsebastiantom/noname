import { expandPermissionsFromKeys, isPlatformRole, PERMISSIONS } from "@noname/auth";
import {
  createCommerceActivityProjector,
  createCommerceContribution,
  createCommerceMachineGuards,
  createCommerceOrderProjector,
  createCommerceProviderEventMappings,
  registerCommerceActivityTypes,
} from "@noname/verticals/commerce";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createAgentDomain } from "./domains/agent";
import { setAgentIdentityResolver } from "./shared/agent-registry-resolver";
import { setAgentGrantResolver } from "./shared/agent-grant-resolver";
import { createCompositeAgentExecutor } from "./domains/agent/composite-executor";
import { createLegacyAgentExecutor } from "./domains/agent/legacy-executor";
import { createMastraExecutor } from "./domains/agent/mastra/executor";
import { parseTaskNotify, taskNotifyVariables } from "./domains/agent/task-notify";
import { createAIPipelineDomain } from "./domains/ai-pipeline";
import { createAnalyticsDomain } from "./domains/analytics";
import { getClickHouseReadiness } from "./domains/analytics/adapters/clickhouse";
import { createAudienceDomain } from "./domains/audiences";
import { createAuthDomain, createAuthorization } from "./domains/auth";
import { listProjectAuthorizations } from "./domains/auth/adapters/zitadel/authorizations";
import { zitadelProjectIdOrNull } from "./domains/auth/adapters/zitadel/project-id";
import {
  createCapabilityIdempotencyStore,
  createCapabilityRegistry,
  registerCapabilityRoutes,
} from "./domains/capabilities";
import { createCollabDomain } from "./domains/collab";
import { createDocumentsDomain } from "./domains/documents";
import { createPostgresDocumentStorage } from "./domains/documents/adapters/postgres";
import { createStorefrontContentRoutes } from "./domains/documents/routes/storefront-content";
import { createEdgeDomain } from "./domains/edge";
import { createEvalDomain } from "./domains/eval";
import { createEvidenceDomain } from "./domains/evidence";
import { createFlagDomain } from "./domains/flags";
import {
  createIntegrationsDomain,
  createProviderEventReceiptStore,
  registerExtensionDispatcher,
} from "./domains/integrations";
import { createMachineDomain } from "./domains/machines";
import { createNotificationsDomain, parseTransitionNotify } from "./domains/notifications";
import { createReleaseDomain } from "./domains/release";
import { createGateVerdictService } from "./domains/release/verdict";
import { createPlatformAuditRoutes } from "./domains/evidence/platform-audit";
import { createPlatformCredentialsDomain } from "./domains/platform-credentials";
import { createTenantProvisioningDomain } from "./domains/tenant-provisioning";
import { tenantProvisioning as tenantProvisioningTable } from "./domains/tenant-provisioning/schema";
import { tenantDirectory as tenantDirectoryTable } from "./domains/tenant-directory/schema";
import { createZitadelProvisioner } from "./domains/tenant-provisioning/adapters/zitadel";
import { CREDENTIAL_ACTIONS } from "./domains/platform-credentials/actions";
import { createSecretsDomain } from "./domains/secrets";
import { createTenantDomain } from "./domains/tenant";
import { createTenantDirectoryDomain } from "./domains/tenant-directory";
import { createSchedulesDomain } from "./domains/schedules";
import type { ScheduleHandler } from "./domains/schedules/definitions";
import { createWebhooksDomain, registerWebhookOutboundRouter } from "./domains/webhooks";
import { createDatabase } from "./drizzle";
import { getBullmqQueue } from "./shared/bullmq-queue";
import { BULLMQ_QUEUES } from "./shared/bullmq-queues";
import { ConflictError, ServiceUnavailableError } from "./shared/domain-error";
import { handleDomainError } from "./shared/error-handler";
import { eventBus } from "./shared/event-bus";
import { isDraining, registerShutdownTask } from "./shared/lifecycle";
import {
  observeHttpRequest,
  recordDatabaseProbe,
  registry,
  renderMetrics,
  setQueueDepthCollector,
} from "./shared/metrics";
import { buildReadiness, type ObservabilityInput } from "./shared/observability";
import { orgMiddleware } from "./shared/org";
import { orgTracingMiddleware } from "./shared/org-tracing";
import { requestIdMiddleware } from "./shared/request-id";
import { getRedisFanoutStatus } from "./shared/redis-fanout-status";
import { workersEnabled } from "./shared/worker-runtime";

/**
 * Builds the full domain graph (services, routes, and — unless `RUN_WORKERS=false` — background
 * BullMQ workers) and the Hono app that exposes it.
 *
 * This is shared between `index.ts` (binds HTTP, is the API replica) and `worker.ts` (never
 * binds HTTP, is the worker replica) because HTTP routes and background workers both come out of
 * the same domain factories — e.g. `createAgentDomain` returns both `routes` and `worker` in one
 * call. Splitting that apart per-domain would be a much larger refactor; gating worker startup
 * via `RUN_WORKERS` (see `shared/worker-runtime.ts`) gets the actual goal — HTTP and job-processing
 * scaling independently, on separate DB connection pools — without it.
 */
/**
 * Deletes a tenant's ZITADEL org. Only purge calls this: revoking access (deactivate) is enough everywhere else, and
 * deleting an identity is irreversible.
 */
async function deleteZitadelOrg(orgId: string): Promise<void> {
  const pat = process.env.ZITADEL_ADMIN_PAT?.trim();
  const issuer = process.env.ZITADEL_ISSUER?.trim() || "http://localhost:8080";
  if (!pat) throw new Error("ZITADEL_ADMIN_PAT is required to purge a tenant org");
  const response = await fetch(`${issuer}/v2/organizations/${orgId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${pat}` },
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`ZITADEL org delete failed (${response.status})`);
  }
}

export async function createApp(): Promise<Hono> {
  const app = new Hono();

  // Must come before any `app.route(...)` below — Hono matches middleware/handlers in
  // registration order, so middleware registered after a route won't apply to it.
  app.use("*", requestIdMiddleware);
  app.use("*", orgMiddleware);
  app.use("*", orgTracingMiddleware);

  /**
   * Request metrics. Labelled by the matched **route pattern** (`c.req.routePath`), never the raw URL:
   * `/api/machines/cart/<uuid>/addToCart` would otherwise create an unbounded label set and take the
   * scrape down with it. Unmatched requests collapse to a placeholder for the same reason.
   */
  app.use("*", async (c, next) => {
    const startedAt = performance.now();
    await next();
    const route = c.req.matchedRoutes.at(-1)?.path ?? "unmatched";
    observeHttpRequest({
      method: c.req.method,
      route,
      status: c.res.status,
      durationSeconds: (performance.now() - startedAt) / 1000,
    });
  });

  app.onError((err, c) => {
    const handled = handleDomainError(err, c);
    if (handled) return handled;
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });
  app.get("/health", (c) => {
    // Always 200 — Redis fan-out degrading to single-instance mode doesn't mean this replica is
    // unhealthy (it's still serving requests), so we don't want liveness probes restarting it.
    // `redis` is for alerting/dashboards to poll and page on, not for the orchestrator to act on.
    const { degraded, subsystems } = getRedisFanoutStatus();
    // Same reasoning for analytics: ClickHouse being unreachable degrades event ingest, not
    // request serving, so it is reported rather than treated as replica unhealthiness.
    const ch = getClickHouseReadiness();
    return c.json({
      status: "ok",
      version: "0.0.1",
      redis: { degraded, subsystems },
      analytics: { ready: ch.ready, attempts: ch.attempts, lastError: ch.lastError },
    });
  });

  /** Readiness/metrics state. Declared before the routes so the handlers can close over it; the
   * probe itself is assigned once the pool exists, below. Until then the replica is correctly
   * reported unready rather than optimistically ready. */
  const startedAt = Date.now();
  let lastDatabaseOk = false;
  let databaseProbe: () => Promise<boolean> = async () => false;

  function observabilityInput(databaseOk: boolean): ObservabilityInput {
    const { degraded, subsystems } = getRedisFanoutStatus();
    const ch = getClickHouseReadiness();
    return {
      draining: isDraining(),
      databaseOk,
      redis: { degraded, subsystems },
      analytics: { ready: ch.ready, attempts: ch.attempts, lastError: ch.lastError },
      startedAt,
      now: Date.now(),
    };
  }

  /** Readiness — what an orchestrator may act on. Unlike `/health`, this can fail. */
  app.get("/ready", async (c) => {
    const databaseOk = await databaseProbe();
    lastDatabaseOk = databaseOk;
    // The gauge reads this rather than probing again, so a scrape stays cheap.
    recordDatabaseProbe(databaseOk);
    const payload = buildReadiness(observabilityInput(databaseOk));
    return c.json(payload, payload.ready ? 200 : 503);
  });

  /** Prometheus scrape target, published through prom-client (see `shared/metrics.ts`). */
  app.get("/metrics", async (c) => {
    // Deliberately does not probe the database: a scrape must be cheap and must not fail because
    // Postgres blipped. `noname_ready` reflects the most recent readiness probe instead.
    return c.text(await renderMetrics(), 200, {
      "Content-Type": registry.contentType,
    });
  });

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new ServiceUnavailableError(
      "DATABASE_URL is required (Postgres). Start Postgres via `podman compose up postgres` (Docker also works).",
    );
  }
  const db = createDatabase(databaseUrl);
  databaseProbe = async () => {
    try {
      await db.execute(sql`select 1`);
      return true;
    } catch (error) {
      console.error("[readiness] database probe failed", error);
      return false;
    }
  };
  // Prime the state so `/metrics` is meaningful before the first readiness probe arrives, and so a
  // broken pool is visible in the logs at boot rather than only when a probe first fails.
  lastDatabaseOk = await databaseProbe();
  if (!lastDatabaseOk) {
    console.warn(
      "[readiness] startup database probe failed; /ready will report unready until it recovers",
    );
  }
  const storage = createPostgresDocumentStorage(db);

  let onAuthProviderPublished: ((orgId: string, type: string, id: string) => Promise<void>) | null =
    null;

  const authorization = createAuthorization();

  const docs = createDocumentsDomain({
    db,
    storage,
    authorization,
    onContentPublished: async (orgId, type, id) => {
      if (onAuthProviderPublished) {
        await onAuthProviderPublished(orgId, type, id);
      }
    },
  });

  const secrets = createSecretsDomain({
    tenantSettings: docs.service.tenantSettings,
  });

  const notifications = createNotificationsDomain({
    db,
    secrets: secrets.service,
    content: docs.service.content,
    tenantSettings: docs.service.tenantSettings,
  });

  const auth = createAuthDomain({
    audit: async (input) => {
      await evidence.service.audit({
        orgId: input.orgId,
        action: input.action,
        actorType: "service",
        actorId: input.actorId,
        subjectType: "platform.token",
        subjectId: input.subjectId,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
    },
    db,
    tenantSettings: docs.service.tenantSettings,
    assets: docs.service.assets,
    content: docs.service.content,
    storage,
    notifications: notifications.service,
  });
  onAuthProviderPublished = auth.onAuthProviderPublished;

  const audiences = createAudienceDomain({ db });
  registerCommerceActivityTypes(audiences.service.activityTypes);
  const commerceAudienceActivityProjector = createCommerceActivityProjector(audiences.service);
  app.route("/api/audiences", audiences.routes);

  const flags = createFlagDomain({ db });
  app.route("/api/flags", flags.routes);

  const analytics = await createAnalyticsDomain((filters) =>
    audiences.service.getExperiencePerformance(filters),
  );
  app.route("/api/analytics", analytics.routes);

  const evidence = createEvidenceDomain({
    db,
    routeOptions: {
      auditPermission: PERMISSIONS.AUDIT_READ,
      permissionsByRecordType: {
        "commerce.order.created": PERMISSIONS.COMMERCE_ORDERS_VIEW,
        "commerce.order.cancelled": PERMISSIONS.COMMERCE_ORDERS_VIEW,
        "commerce.order.fulfilled": PERMISSIONS.COMMERCE_ORDERS_VIEW,
        "commerce.payment.receipt": PERMISSIONS.COMMERCE_ORDERS_VIEW,
      },
      permissionsBySubjectType: {
        "commerce.order": PERMISSIONS.COMMERCE_ORDERS_VIEW,
        "commerce.payment": PERMISSIONS.COMMERCE_ORDERS_VIEW,
        "tenant.storefront": PERMISSIONS.AUDIT_READ,
        "platform.environment": PERMISSIONS.AUDIT_READ,
        "platform.release_channel": PERMISSIONS.AUDIT_READ,
      },
    },
  });
  const commerceOrderProjector = createCommerceOrderProjector(evidence.service);
  const machines = createMachineDomain({
    db,
    tenantSettings: docs.service.tenantSettings,
    guards: createCommerceMachineGuards(),
    hooks: {
      async onTransitionComplete(transition) {
        await commerceOrderProjector(transition);
        const paidActivity = await commerceAudienceActivityProjector(transition);
        if (paidActivity) {
          const attribution = await audiences.service.attributeTrustedGoal(paidActivity);
          if (attribution) {
            await analytics.service.ingestServerEvent("experience.outcome", {
              orgId: paidActivity.orgId,
              sessionId: attribution.sessionId,
              audienceKey: attribution.audienceKey,
              audienceDefinitionVersion: attribution.audienceDefinitionVersion,
              bindingId: attribution.bindingId,
              bindingVersion: attribution.bindingVersion,
              decisionId: attribution.decisionId,
              pageKey: attribution.pageKey,
              locale: attribution.locale,
              schemaId: attribution.schemaId,
              variantId: attribution.variantId,
              goalEvent: paidActivity.type,
            });
          }
        }
        const notify = parseTransitionNotify(transition.params);
        if (!notify) return;
        await notifications.service.notify(transition.orgId, notify);
      },
    },
  });

  // Republish transitions whose event was committed but never delivered. Started where background work
  // runs, and stopped on shutdown so a half-marked batch is not abandoned mid-flight.
  if (workersEnabled()) {
    machines.relay.start();
    registerShutdownTask("machine-transition-relay", () => machines.relay.stop());
  }

  // Queue depth for every BullMQ queue. Supplied as a collector so `shared/metrics.ts` stays free of a
  // dependency on the queue layer; the gauge awaits it on each scrape.
  setQueueDepthCollector(async () => {
    const depths: Record<string, Record<string, number>> = {};
    for (const queueName of new Set(Object.values(BULLMQ_QUEUES))) {
      try {
        depths[queueName] = await getBullmqQueue(queueName).getJobCounts();
      } catch {
        // A queue whose Redis connection is down must not break the whole scrape.
        depths[queueName] = { unavailable: 1 };
      }
    }
    return depths;
  });

  const integrations = createIntegrationsDomain({
    secrets: secrets.service,
    tenantSettings: docs.service.tenantSettings,
    providerEventMachines: machines.engine,
    providerEventMappings: createCommerceProviderEventMappings(),
    providerEventReceipts: createProviderEventReceiptStore(db),
  });

  const commerce = createCommerceContribution({
    machines: machines.engine,
    integrations: integrations.service,
    catalog: docs.service.content,
    evidence: evidence.service,
  });

  const webhooks = createWebhooksDomain({
    db,
    secrets: secrets.service,
  });

  registerWebhookOutboundRouter({
    webhooks: webhooks.service,
    subscribe: (event, handler) => {
      eventBus.subscribe(event, handler);
    },
  });

  app.route("/api/documents", docs.routes);
  app.route(
    "/api/storefront/content",
    createStorefrontContentRoutes({
      contentTypes: docs.service.contentTypes,
      storage,
      tenantSettings: docs.service.tenantSettings,
    }),
  );

  const collab = createCollabDomain({
    storage,
    layout: docs.service.layout,
    content: docs.service.content,
    authorization,
    db,
  });
  app.route("/api/collab", collab.routes);

  /**
   * Persist open collab rooms on shutdown. Edits live in this process's CRDT document and are written on a
   * 5 s debounce, so without this every deploy drops up to five seconds of live typing or layout editing —
   * work that exists nowhere else once the process exits.
   *
   * Registered for both room managers rather than gated on `workersEnabled()`: rooms exist only on
   * replicas serving websockets, so whichever process holds them must flush them.
   */
  registerShutdownTask("collab-flush", async () => {
    await Promise.allSettled([collab.rooms.flushAllRooms(), collab.richtextRooms.flushAllRooms()]);
  });

  app.route("/api/machines", machines.routes);

  const aiPipeline = createAIPipelineDomain({ db, secrets: secrets.service });
  app.route("/api/ai", aiPipeline.routes);

  const agentExecutor = createCompositeAgentExecutor({
    legacy: createLegacyAgentExecutor({
      aiPipeline: aiPipeline.service,
      analytics: analytics.service,
    }),
    mastra: createMastraExecutor({
      secrets: secrets.service,
      authorization,
      documents: storage,
      analytics: analytics.service,
      integrations: integrations.service,
      aiPipeline: aiPipeline.service,
      layout: docs.service.layout,
      content: docs.service.content,
      machines: machines.engine,
      layoutCollabRooms: collab.rooms,
    }),
  });

  const agent = createAgentDomain({
    db,
    authorization,
    executor: agentExecutor,
    layout: docs.service.layout,
    layoutCollabRooms: collab.rooms,
    workerHooks: {
      async onTaskCompleted({ orgId, type, prompt, input, output }) {
        const notify = parseTaskNotify(input);
        if (!notify) return;

        const templateId = notify.templateId ?? "agent-task-complete";
        await notifications.service.notify(orgId, {
          trigger: templateId,
          to: notify.to,
          userId: notify.userId,
          variables: taskNotifyVariables(type, prompt, output, notify),
          idempotencyKey: notify.userId ? `agent-task:${type}:${notify.userId}` : undefined,
        });
      },
    },
  });
  app.route("/api/agents", agent.routes);
  setAgentIdentityResolver((orgId, zitadelAgentUserId) =>
    agent.storage.findByZitadelAgentUserId(orgId, zitadelAgentUserId),
  );
  setAgentGrantResolver((orgId, jti) => agent.storage.findTokenGrant(orgId, jti));

  const edge = createEdgeDomain({
    layout: docs.service.layout,
    content: docs.service.content,
    tenantSettings: docs.service.tenantSettings,
    pages: docs.service.pages,
    audiences: audiences.service,
    flags: flags.service,
    analytics: analytics.service,
  });
  app.route("/api/edge", edge.routes);

  const verdictService = createGateVerdictService(evidence.service);
  /**
   * Purge one tenant: rows, IdP org, and one platform audit row.
   *
   * Extracted because two callers need identical behaviour — the operator route and the retention schedule. A copy
   * per caller is how "the button deleted the org but the timer did not" happens.
   */
  async function purgeTenant(orgId: string, actorId: string): Promise<{ purged: boolean }> {
    const entry = await tenantDirectory.service.get(orgId);
    if (!entry) return { purged: false };
    if (entry.status !== "deleted") {
      throw new ConflictError(
        `Tenant ${orgId} must be deleted before it can be purged (is ${entry.status})`,
        { orgId },
      );
    }

    // The IdP org goes first: if that fails, the rows still explain what exists rather than leaving an orphan identity.
    await deleteZitadelOrg(orgId);

    await db.delete(tenantProvisioningTable).where(eq(tenantProvisioningTable.orgId, orgId));
    await db.delete(tenantDirectoryTable).where(eq(tenantDirectoryTable.orgId, orgId));

    // Written to the **platform** stream: the tenant's own stream is what was just removed.
    const platformOrgId = process.env.PLATFORM_ORG_ID?.trim();
    if (platformOrgId) {
      await evidence.service.audit({
        orgId: platformOrgId,
        action: "platform.tenant.purged",
        actorType: "service",
        actorId,
        subjectType: "platform.tenant",
        subjectId: orgId,
        metadata: { slug: entry.slug },
      });
    }
    return { purged: true };
  }

  const tenantDirectory = createTenantDirectoryDomain({
    db,
    verdict: (input) => verdictService.lookup(input),
    acknowledge: (input) => verdictService.acknowledge(input),
    rollback: (input) => releaseDomain.pointer.rollback(input.orgId, input.actorId),
    softDelete: async ({ orgId }) => {
      const entry = await tenantDirectory.service.get(orgId);
      if (!entry) throw new Error(`no directory row for ${orgId}`);
      // Offboarding revokes, delete hides. Requiring the earlier step keeps the two from being confused.
      if (entry.status !== "offboarding") {
        throw new ConflictError(`Tenant ${orgId} must be offboarding before it can be deleted (is ${entry.status})`, { orgId });
      }
      await tenantDirectory.service.upsert({ orgId, slug: entry.slug, status: "deleted" });
      return { status: "deleted" };
    },
    purge: async ({ orgId, actorId }) => purgeTenant(orgId, actorId),
    history: async (input) =>
      evidence.service.listAuditAcross({
        orgId: input.orgId,
        actionPrefix: "platform.release.",
        limit: input.limit ?? 50,
      }),
  });
  const releaseDomain = createReleaseDomain({
    db,
    evidence: evidence.service,
    selectability: (orgId) => tenantDirectory.service.selectability(orgId),
    verdict: (input) => verdictService.lookup(input),
  });
  const tenant = createTenantDomain({
    tenantSettings: docs.service.tenantSettings,
    clientBundle: (orgId) => releaseDomain.pointer.clientBundle(orgId),
  });
  app.route("/api/tenants", tenant.routes);
  const platformCredentials = createPlatformCredentialsDomain({ evidence: evidence.service });
  const tenantProvisioning = createTenantProvisioningDomain({
    db,
    provisioner: createZitadelProvisioner(),
    audit: async (input) => {
      const orgId = process.env.PLATFORM_ORG_ID?.trim();
      if (!orgId) return;
      await evidence.service.audit({
        orgId,
        action: input.action,
        actorType: "service",
        actorId: input.actorId,
        subjectType: "platform.tenant_directory",
        subjectId: "backfill",
        ...(input.metadata ? { metadata: input.metadata } : {}),
      });
    },
    recordCredential: async (input) => {
      // Offboarding records a revocation; everything else records the creation and the grant that follows it.
      const actions =
        input.action === "revoked"
          ? [CREDENTIAL_ACTIONS.REVOKED]
          : [CREDENTIAL_ACTIONS.CREATED, CREDENTIAL_ACTIONS.GRANTED];
      for (const action of actions) {
        await platformCredentials.record({
          action,
          orgId: input.orgId,
          accountId: input.accountId,
          accountName: input.accountName,
          role: input.roleKey,
          actorType: "service",
          actorId: input.accountId,
        });
      }
    },
    directory: {
      list: async () =>
        (await tenantDirectory.service.list({ excludePlatform: false })).map((entry) => ({
          orgId: entry.orgId,
          slug: entry.slug,
        })),
      setStatus: async (orgId, status) => {
        const entry = await tenantDirectory.service.get(orgId);
        if (!entry) throw new Error(`no directory row for ${orgId}`);
        await tenantDirectory.service.upsert({ orgId, slug: entry.slug, status });
      },
      upsert: async (input) => {
        await tenantDirectory.service.upsert({
          orgId: input.orgId,
          slug: input.slug,
          provisioningState: input.provisioningState,
        });
      },
    },
  });
  // POST first: creation lives on the same prefix as the inventory, different verbs.
  /**
   * Retention sweep: everything soft-deleted longer than RETENTION_DAYS.
   *
   * State-based on purpose — it asks "what is overdue?" rather than scheduling one timer per tenant, so a missed tick
   * or a week of downtime changes nothing. Dry-run reports and touches nothing.
   */
  const retentionHandler: ScheduleHandler = async ({ dryRun }) => {
    const days = Number(process.env.RETENTION_DAYS ?? "30");
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const deleted = await tenantDirectory.service.list({ status: "deleted" });

    let items = 0;
    for (const tenant of deleted) {
      if (tenant.updatedAt >= cutoff) continue;
      items += 1;
      if (dryRun) continue;
      // Per-tenant so one bad row does not abort the sweep; the purge is idempotent and audited individually.
      await purgeTenant(tenant.orgId, "schedule:tenant-retention-purge").catch((cause) => {
        console.error(`[schedules] purge failed for ${tenant.orgId}: ${String(cause)}`);
      });
    }
    return { items, dryRun };
  };

  const schedules = createSchedulesDomain({
    db,
    evidence: evidence.service,
    handlers: { "tenant-retention-purge": retentionHandler },
  });

  app.route("/api/platform/operators", tenantProvisioning.operatorRoutes);
  app.route("/api/platform/schedules", schedules.routes);
  app.route("/api/platform/tenants", tenantProvisioning.routes);
  app.route("/api/platform/tenants", tenantDirectory.routes);

  const isExtensionInstalled = async (orgId: string, extension: string): Promise<boolean> => {
    try {
      const manifest = await tenant.service.getManifest(orgId);
      return manifest.extensions?.includes(extension) ?? false;
    } catch {
      return false;
    }
  };
  registerExtensionDispatcher({
    subscribe: (event: string, handler: (payload: unknown) => Promise<void>) => {
      eventBus.subscribe(event, handler);
    },
    isExtensionInstalled,
  });

  const capabilities = createCapabilityRegistry(commerce);
  const capabilityRoutes = new Hono();
  registerCapabilityRoutes(
    capabilityRoutes,
    capabilities,
    docs.service.tenantSettings,
    createCapabilityIdempotencyStore(db),
    { isExtensionInstalled },
  );

  app.route("/api/capabilities", capabilityRoutes);

  // Machine-only context for the eval service: capability descriptors + installed extensions. It is a
  // read-only projection of the registry, not a second source of truth.
  //
  // Roles come from ZITADEL through the server's own credentials. Eval never receives a ZITADEL admin
  // credential; it only sees the role→permissions projection, and only for its own org.
  const listEvalRoles = async (orgId: string) => {
    const projectId = zitadelProjectIdOrNull();
    if (!projectId) return null;

    const rows = await listProjectAuthorizations(orgId, projectId);
    const roleKeys = new Set<string>();
    for (const row of rows) {
      for (const role of row.roles ?? []) {
        const key = role.key?.trim();
        if (key && isPlatformRole(key)) roleKeys.add(key);
      }
    }

    const roles: Record<string, string[]> = {};
    for (const key of roleKeys) roles[key] = expandPermissionsFromKeys([key]);
    return { roles };
  };

  const evalDomain = createEvalDomain({
    capabilities,
    tenants: tenant.service,
    evidence: evidence.service,
    listRoles: listEvalRoles,
  });
  app.route("/api/eval", evalDomain.routes);

  app.route("/api/releases", releaseDomain.routes);

  app.route("/api/auth", auth.routes);
  app.route("/api/integrations", integrations.routes);
  app.route("/api/notifications", notifications.routes);
  app.route("/api/webhooks", webhooks.routes);
  app.route("/api/evidence", evidence.routes);
  app.route("/api/platform/audit", createPlatformAuditRoutes(evidence.service));
  app.route(
    "/api/platform/credentials",
    platformCredentials.routes,
  );

  // Registration is idempotent (one scheduler per definition), so a restart does not double the cadence.
  await schedules.start().catch((cause) => {
    console.error(`[schedules] failed to start: ${String(cause)}`);
  });

  return app;
}
