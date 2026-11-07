import { and, desc, eq, inArray } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import { StorageError } from "../../../shared/domain-error";
import type { ReleaseArtifact, ReleaseDTO, ReleaseState, ReleaseStore } from "../ports";
import { releaseArtifacts, releases } from "../schema";

type ReleaseRow = typeof releases.$inferSelect;
type ArtifactRow = typeof releaseArtifacts.$inferSelect;

function mapArtifact(row: ArtifactRow): ReleaseArtifact {
  return {
    id: row.id,
    releaseId: row.releaseId,
    kind: row.kind,
    ref: row.ref,
    digest: row.digest,
    createdAt: row.created_at,
  };
}

function mapRelease(row: ReleaseRow, artifacts: ArtifactRow[]): ReleaseDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    platformVersion: row.platformVersion,
    checksVersion: row.checksVersion,
    state: row.state,
    createdBy: row.createdBy,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    artifacts: artifacts.map(mapArtifact),
  };
}

export function createPostgresReleaseStore(db: Database): ReleaseStore {
  const findById = async (orgId: string, id: string): Promise<ReleaseDTO | null> => {
    const [row] = await db
      .select()
      .from(releases)
      .where(and(eq(releases.orgId, orgId), eq(releases.id, id)));
    if (!row) return null;
    const artifacts = await db
      .select()
      .from(releaseArtifacts)
      .where(eq(releaseArtifacts.releaseId, id))
      .orderBy(releaseArtifacts.kind);
    return mapRelease(row, artifacts);
  };

  return {
    async create(orgId, input, createdBy) {
      return db.transaction(async (tx) => {
        const [row] = await tx
          .insert(releases)
          .values({
            orgId,
            platformVersion: input.platformVersion,
            checksVersion: input.checksVersion,
            createdBy,
          })
          .returning();
        if (!row) throw new StorageError("Failed to create release");

        const artifacts = await tx
          .insert(releaseArtifacts)
          .values(input.artifacts.map((artifact) => ({ releaseId: row.id, ...artifact })))
          .returning();

        return mapRelease(row, artifacts);
      });
    },

    findById,

    async list(orgId) {
      const rows = await db
        .select()
        .from(releases)
        .where(eq(releases.orgId, orgId))
        .orderBy(desc(releases.created_at));
      if (rows.length === 0) return [];

      const artifactRows = await db
        .select()
        .from(releaseArtifacts)
        .where(
          inArray(
            releaseArtifacts.releaseId,
            rows.map((row) => row.id),
          ),
        )
        .orderBy(releaseArtifacts.kind);

      const byRelease = new Map<string, ArtifactRow[]>();
      for (const artifact of artifactRows) {
        const list = byRelease.get(artifact.releaseId) ?? [];
        list.push(artifact);
        byRelease.set(artifact.releaseId, list);
      }

      return rows.map((row) => mapRelease(row, byRelease.get(row.id) ?? []));
    },

    async updateState(orgId, id, state: ReleaseState) {
      const [row] = await db
        .update(releases)
        .set({ state, updated_at: new Date() })
        .where(and(eq(releases.orgId, orgId), eq(releases.id, id)))
        .returning();
      if (!row) throw new StorageError(`Failed to update release ${id}`);
      const updated = await findById(orgId, id);
      if (!updated) throw new StorageError(`Failed to reload release ${id}`);
      return updated;
    },
  };
}
