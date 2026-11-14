import type { CreateProvisioningInput, ProvisioningRecord, ProvisioningService, ProvisioningStore } from "./ports";
import type { ProvisioningSteps } from "./schema";

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
): ProvisioningService {
  async function markSteps(record: ProvisioningRecord, steps: ProvisioningSteps) {
    return store.update(record.orgId, { steps });
  }

  return {
    async start(input: CreateProvisioningInput) {
      const record = await store.create(input);
      // Fire and forget: the API returns 202 with the record and the caller polls. Steps are recorded, so a crash
      // leaves an explainable `in_progress` row rather than a lie.
      if (record.state === "pending") void run(record.orgId).catch(() => {});
      return record;
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
