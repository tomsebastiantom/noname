import type { CreateProvisioningInput, ProvisioningRecord, ProvisioningService, ProvisioningStore } from "./ports";
import type { ProvisioningSteps } from "./schema";

export type ProvisionerPort = {
  ensureOrg(name: string): Promise<{ orgId: string }>;
  ensureHumanAdmin(input: { orgId: string; email: string }): Promise<{ userId: string }>;
  ensurePlatformOperator(input: { orgId: string; email: string }): Promise<{ userId: string }>;
  deactivateEvalAccount(input: { orgId: string; accountName: string }): Promise<{ deactivated: boolean }>;
  ensureProjectGrant(orgId: string, roleKeys: string[]): Promise<void>;
  ensureEvalAccount(input: { orgId: string; roleKey: string; accountName: string }): Promise<{ userId: string }>;
};

export type DirectoryPort = {
  /** Moves the tenant out of the promotable set. */
  setStatus(orgId: string, status: "offboarding"): Promise<void>;
  list(): Promise<Array<{ orgId: string; slug: string }>>;
  /** Ensures the inventory row exists and sets its provisioning state. */
  upsert(input: {
    orgId: string;
    slug: string;
    provisioningState: "in_progress" | "ready";
  }): Promise<void>;
};

const now = () => new Date().toISOString();

/**
 * Drizzle wraps driver failures, and `Error.message` then holds the SQL text — which tells you a query ran, not why it
 * failed. The Postgres cause is one level down; include it so a provisioning failure is diagnosable from the API.
 */
function describeError(cause: unknown): string {
  if (!(cause instanceof Error)) return String(cause);
  const nested = (cause as { cause?: unknown }).cause;
  if (nested instanceof Error && nested.message && !cause.message.includes(nested.message)) {
    return `${cause.message} | ${nested.message}`;
  }
  return cause.message;
}

/**
 * Phase 1–2 of the provisioning RFC: one operation, recorded step by step.
 *
 * Step order matters. The directory row is written **first**, in `in_progress`, so a half-built tenant is never
 * wave-eligible; the IdP steps (phase 3) come after it for the same reason — the reverse order would leave an
 * identity with no inventory row and nobody to notice.
 */
export function createTenantProvisioningService(
  store: ProvisioningStore,
  directory: DirectoryPort,
  provisioner?: ProvisionerPort,
  recordCredential?: (input: {
    orgId: string;
    accountId: string;
    accountName: string;
    roleKey: string;
    action?: "created" | "revoked";
  }) => Promise<void>,
): ProvisioningService {
  async function markSteps(record: ProvisioningRecord, steps: ProvisioningSteps) {
    return store.update(record.orgId, { steps });
  }

  return {
    async start(input: CreateProvisioningInput) {
      // A tenant id only exists once the IdP has one: when the caller supplies a slug, the org comes first.
      let resolvedOrgId = input.orgId?.trim();
      if (!resolvedOrgId) {
        if (!provisioner) throw new Error("no provisioner configured; cannot create the tenant org");
        resolvedOrgId = (await provisioner.ensureOrg(input.slug)).orgId;
      }
      const request: CreateProvisioningInput = { ...input, orgId: resolvedOrgId };
      const existing =
        (await store.findByIdempotencyKey(input.idempotencyKey)) ?? (await store.get(resolvedOrgId));
      const record = await store.create(request);
      // Fire and forget: the API returns 202 with the record and the caller polls. Steps are recorded, so a crash
      // leaves an explainable `in_progress` row rather than a lie.
      if (record.state === "pending") void run(record.orgId).catch(() => {});
      return { record, created: !existing };
    },

    get: (orgId) => store.get(orgId),

    /**
     * Give pre-existing tenants a provisioning record so the console has one shape for every tenant.
     * `eval_account: unknown` is deliberate: those accounts were created by hand or by the deleted script, and
     * claiming `done` would assert something we never observed.
     */
    /**
     * Offboard a tenant: stop it being promotable first, then take its credential away.
     *
     * Order matters. Marking the directory first means a wave running concurrently can no longer select the tenant,
     * so there is no window where the credential is gone but the tenant still looks promotable.
     */
    async offboard(orgId) {
      if (!provisioner) throw new Error("no provisioner configured; cannot revoke tenant credentials");
      const record = await store.get(orgId);
      if (!record) throw new Error(`no provisioning row for ${orgId}`);

      await directory.setStatus(orgId, "offboarding");

      let steps: ProvisioningSteps = { ...record.steps, offboard: { status: "pending" } };
      await store.update(orgId, { steps });

      try {
        const accountName = `eval-runner-${orgId}`;
        const result = await provisioner.deactivateEvalAccount({ orgId, accountName });
        if (result.deactivated && recordCredential) {
          await recordCredential({
            orgId,
            accountId: accountName,
            accountName,
            roleKey: "eval_reader",
            action: "revoked",
          });
        }
        steps = { ...steps, offboard: { status: "done", at: now() } };
        return store.update(orgId, { steps });
      } catch (cause) {
        const message = describeError(cause);
        await store.update(orgId, {
          steps: { ...steps, offboard: { status: "failed", error: message, at: now() } },
          lastError: message,
        });
        throw cause;
      }
    },

    async backfill() {
      const tenants = await directory.list();
      let created = 0;
      for (const tenant of tenants) {
        if (await store.get(tenant.orgId)) continue;
        const key = `backfill:${tenant.orgId}`;
        const record = await store.create({
          orgId: tenant.orgId,
          slug: tenant.slug,
          idempotencyKey: key,
          requestedBy: "system",
        });
        // Another process may have created the row first; only the owner of the key records the state.
        if (record.idempotencyKey !== key) continue;
        await store.update(tenant.orgId, {
          state: "ready",
          steps: {
            directory: { status: "done", at: now() },
            eval_account: { status: "unknown" },
          },
          finishedAt: new Date(),
        });
        created += 1;
      }
      return { examined: tenants.length, created };
    },

    async invite(orgId, email) {
      if (!provisioner) throw new Error("no provisioner configured; cannot invite a tenant admin");
      const record = await store.get(orgId);
      if (!record) throw new Error(`no provisioning row for ${orgId}`);
      const user = await provisioner.ensureHumanAdmin({ orgId, email });
      if (recordCredential) {
        await recordCredential({
          orgId,
          accountId: user.userId,
          accountName: email,
          roleKey: "ORG_OWNER",
        });
      }
      return store.update(orgId, {
        steps: { ...record.steps, invite: { status: "done", at: now() } },
      });
    },

    run: (orgId) => run(orgId),
  };

  async function run(orgId: string): Promise<ProvisioningRecord> {
    let record = await store.get(orgId);
    if (!record) throw new Error(`no provisioning row for ${orgId}`);

    record = await store.update(orgId, {
      state: "in_progress",
      attempts: record.attempts + 1,
      lastError: null,
    });

    // Step: directory -------------------------------------------------------
    try {
      await directory.upsert({
        orgId: record.orgId,
        slug: slugFromRecord(record),
        provisioningState: "in_progress",
      });
      record = await markSteps(record, {
        ...record.steps,
        directory: { status: "done", at: now() },
      });
    } catch (cause) {
      const message = describeError(cause);
      await store.update(orgId, {
        state: "failed",
        lastError: message,
        steps: { ...record.steps, directory: { status: "failed", error: message, at: now() } },
        finishedAt: new Date(),
      });
      throw cause;
    }

    // Step: identity (ZITADEL org + project grant) ---------------------------
    if (provisioner) {
      try {
        const org = await provisioner.ensureOrg(slugFromRecord(record));
        await provisioner.ensureProjectGrant(org.orgId, ["eval_reader"]);
        record = await markSteps(record, {
          ...record.steps,
          identity: { status: "done", at: now() },
        });
      } catch (cause) {
        const message = describeError(cause);
        await store.update(orgId, {
          state: "failed",
          lastError: message,
          steps: { ...record.steps, identity: { status: "failed", error: message, at: now() } },
          finishedAt: new Date(),
        });
        throw cause;
      }

      // Step: eval account --------------------------------------------------
      try {
        const account = await provisioner.ensureEvalAccount({
          orgId,
          roleKey: "eval_reader",
          accountName: `eval-runner-${orgId}`,
        });
        // Record the credential in the **tenant's** audit stream (decision P3): the tenant should be able to see
        // that an eval credential was created for them, and who created it.
        if (recordCredential) {
          await recordCredential({
            orgId,
            accountId: account.userId,
            accountName: `eval-runner-${orgId}`,
            roleKey: "eval_reader",
          });
        }
        record = await markSteps(record, {
          ...record.steps,
          eval_account: { status: "done", at: now() },
        });
      } catch (cause) {
        const message = describeError(cause);
        await store.update(orgId, {
          state: "failed",
          lastError: message,
          steps: { ...record.steps, eval_account: { status: "failed", error: message, at: now() } },
          finishedAt: new Date(),
        });
        throw cause;
      }
    }

    // Step: done ------------------------------------------------------------
    await directory.upsert({
      orgId: record.orgId,
      slug: slugFromRecord(record),
      provisioningState: "ready",
    });
    return store.update(orgId, {
      state: "ready",
      steps: { ...record.steps, directory: { status: "done", at: now() } },
      lastError: null,
      finishedAt: new Date(),
    });
  }
}

/** Stored slug wins; the legacy parse exists only for rows written before the column did. */
function slugFromRecord(record: ProvisioningRecord): string {
  if (record.slug) return record.slug;
  const [slug] = record.idempotencyKey.split(":");
  return slug || record.orgId;
}
