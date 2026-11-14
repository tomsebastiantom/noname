import type { CreateProvisioningInput, ProvisioningRecord, ProvisioningService, ProvisioningStore } from "./ports";
import type { ProvisioningSteps } from "./schema";

export type ProvisionerPort = {
  ensureOrg(name: string): Promise<{ orgId: string }>;
  ensureProjectGrant(orgId: string, roleKeys: string[]): Promise<void>;
  ensureEvalAccount(input: { orgId: string; roleKey: string; accountName: string }): Promise<{ userId: string }>;
};

export type DirectoryPort = {
  /** Ensures the inventory row exists and sets its provisioning state. */
  upsert(input: {
    orgId: string;
    slug: string;
    provisioningState: "in_progress" | "ready";
  }): Promise<void>;
};

const now = () => new Date().toISOString();

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
      const message = cause instanceof Error ? cause.message : String(cause);
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
        const message = cause instanceof Error ? cause.message : String(cause);
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
        await provisioner.ensureEvalAccount({
          orgId,
          roleKey: "eval_reader",
          accountName: `eval-runner-${orgId}`,
        });
        record = await markSteps(record, {
          ...record.steps,
          eval_account: { status: "done", at: now() },
        });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
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

/** The slug is part of the idempotency key contract: `<slug>:<orgId>`. */
function slugFromRecord(record: ProvisioningRecord): string {
  const [slug] = record.idempotencyKey.split(":");
  return slug || record.orgId;
}
