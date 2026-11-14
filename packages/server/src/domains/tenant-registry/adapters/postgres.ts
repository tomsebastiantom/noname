import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import { documents } from "../../documents/schema";
import type {
  TenantDirectoryEntry,
  TenantDirectoryStore,
  TenantListFilter,
  UpsertTenantInput,
} from "../ports";
import { type TenantStatus, tenantDirectory } from "../schema";

function mapRow(row: typeof tenantDirectory.$inferSelect): TenantDirectoryEntry {
  return {
    orgId: row.orgId,
    slug: row.slug,
    status: row.status as TenantStatus,
    plan: row.plan,
    region: row.region,
    excludedReason: row.excludedReason,
    provisioningState: row.provisioningState as TenantDirectoryEntry["provisioningState"],
    isPlatform: row.isPlatform === "true",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function createTenantDirectoryPostgresStore(db: Database): TenantDirectoryStore {
  return {
    async list(filter) {
      const conditions = [];
      if (filter.status) conditions.push(eq(tenantDirectory.status, filter.status));
      if (filter.excludePlatform) conditions.push(eq(tenantDirectory.isPlatform, "false"));

      const rows = await db
        .select()
        .from(tenantDirectory)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(tenantDirectory.slug)
        .limit(filter.limit ?? 500);
      return rows.map(mapRow);
    },

    async get(orgId) {
      const [row] = await db
        .select()
        .from(tenantDirectory)
        .where(eq(tenantDirectory.orgId, orgId));
      return row ? mapRow(row) : null;
    },

    async upsert(input: UpsertTenantInput) {
      const [row] = await db
        .insert(tenantDirectory)
        .values({
          orgId: input.orgId,
          slug: input.slug,
          status: input.status ?? "active",
          plan: input.plan ?? null,
          region: input.region ?? null,
          excludedReason: input.excludedReason ?? null,
          provisioningState: input.provisioningState ?? "ready",
          isPlatform: input.isPlatform ? "true" : "false",
        })
        .onConflictDoUpdate({
          target: tenantDirectory.orgId,
          set: {
            slug: input.slug,
            ...(input.status ? { status: input.status } : {}),
            ...(input.plan !== undefined ? { plan: input.plan } : {}),
            ...(input.region !== undefined ? { region: input.region } : {}),
            ...(input.excludedReason !== undefined
              ? { excludedReason: input.excludedReason }
              : {}),
            ...(input.provisioningState ? { provisioningState: input.provisioningState } : {}),
          ...(input.isPlatform !== undefined
              ? { isPlatform: input.isPlatform ? "true" : "false" }
              : {}),
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!row) throw new Error(`tenant directory upsert returned no row for ${input.orgId}`);
      return mapRow(row);
    },

    /**
     * Backfill from the only existing source of truth for "this org is a tenant": its
     * `tenant_settings` document. Idempotent — orgs already in the directory are untouched.
     */
    async backfill() {
      const rows = await db
        .select({
          orgId: documents.orgId,
          slug: sql<string | null>`${documents.data}->>'slug'`,
        })
        .from(documents)
        .where(and(eq(documents.type, "tenant_settings"), eq(documents.key, "default")));

      let created = 0;
      for (const row of rows) {
        const slug = row.slug?.trim();
        if (!slug) continue;
        const inserted = await db
          .insert(tenantDirectory)
          .values({ orgId: row.orgId, slug })
          .onConflictDoNothing({ target: tenantDirectory.orgId })
          .returning({ orgId: tenantDirectory.orgId });
        created += inserted.length;
      }
      return created;
    },
  };
}
