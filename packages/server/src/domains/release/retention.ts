import type { EnvironmentStore, PointerStore, ReleaseRetention, ReleaseStore } from "./ports";

/**
 * D1 retention: releases are immutable and accumulate. Keep the newest N plus everything still referenced by a
 * pointer or an environment, and drop the rest.
 *
 * Deleting a DB row does not delete the R2 bundle; object lifecycle is a separate concern (documented).
 */
export function createReleaseRetention(
  releases: ReleaseStore,
  environments: EnvironmentStore,
  pointers: PointerStore,
): ReleaseRetention {
  return {
    async prune(orgId, keep = 3) {
      const [all, envs, pointer] = await Promise.all([
        releases.list(orgId),
        environments.list(orgId),
        pointers.get(orgId),
      ]);

      const protectedIds = new Set<string>();
      for (const environment of envs) {
        if (environment.activeReleaseId) protectedIds.add(environment.activeReleaseId);
        if (environment.previousReleaseId) protectedIds.add(environment.previousReleaseId);
      }
      if (pointer) {
        protectedIds.add(pointer.releaseId);
        if (pointer.previousReleaseId) protectedIds.add(pointer.previousReleaseId);
      }

      const newest = [...all]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, Math.max(0, keep))
        .map((release) => release.id);
      const keepIds = new Set([...newest, ...protectedIds]);

      const toDelete = all
        .filter((release) => !keepIds.has(release.id))
        .map((release) => release.id);
      if (toDelete.length === 0) return { deleted: [] };

      return { deleted: await releases.delete(orgId, toDelete) };
    },
  };
}
