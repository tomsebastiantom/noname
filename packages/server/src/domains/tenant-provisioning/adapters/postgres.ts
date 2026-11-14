import { eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import type { CreateProvisioningInput, ProvisioningRecord, ProvisioningStore } from "../ports";
import { type ProvisioningState, tenantProvisioning } from "../schema";

function mapRow(row: typeof tenantProvisioning.$inferSelect): ProvisioningRecord {
  return {
    orgId: row.orgId,
    slug: row.slug,
    idempotencyKey: row.idempotencyKey,
    state: row.state as ProvisioningState,
    steps: row.steps ?? {},
    requestedBy: row.requestedBy,
    attempts: row.attempts,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    finishedAt: row.finishedAt,
  };
}

export function createTenantProvisioningStore(db: Database): ProvisioningStore {
  return {
    async create(input: CreateProvisioningInput) {
      const orgId = input.orgId?.trim();
      if (!orgId) throw new Error("provisioning row requires a resolved org id");
      const [row] = await db
        .insert(tenantProvisioning)
        .values({
          orgId,
          slug: input.slug,
          idempotencyKey: input.idempotencyKey,
          requestedBy: input.requestedBy,
          steps: { directory: { status: "pending" } },
        })
        .onConflictDoNothing()
        .returning();
      if (row) return mapRow(row);

      // Conflict on either the org id or the idempotency key: return what exists instead of failing.
      const existing =
        (await this.get(orgId)) ?? (await this.findByIdempotencyKey(input.idempotencyKey));
      if (!existing) throw new Error(`provisioning row for ${orgId} vanished during insert`);
      return existing;
    },

    async get(orgId) {
      const [row] = await db
        .select()
        .from(tenantProvisioning)
        .where(eq(tenantProvisioning.orgId, orgId));
      return row ? mapRow(row) : null;
    },

    async findByIdempotencyKey(key) {
      const [row] = await db
        .select()
        .from(tenantProvisioning)
        .where(eq(tenantProvisioning.idempotencyKey, key));
      return row ? mapRow(row) : null;
    },

    async update(orgId, patch) {
      const [row] = await db
        .update(tenantProvisioning)
        .set({
          ...(patch.state ? { state: patch.state } : {}),
          ...(patch.steps ? { steps: patch.steps } : {}),
          ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
          ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
          ...(patch.finishedAt !== undefined ? { finishedAt: patch.finishedAt } : {}),
          updatedAt: new Date(),
        })
        .where(eq(tenantProvisioning.orgId, orgId))
        .returning();
      if (!row) throw new Error(`no provisioning row for ${orgId}`);
      return mapRow(row);
    },
  };
}
