import { randomUUID } from "node:crypto";
import { injectTraceCarrier } from "../../shared/bullmq-trace";
import type { ManifestStore } from "./adapters/manifest-store";
import type { CatalogManifest, TenantCatalogService } from "./ports";
import { getCatalogBuildQueue } from "./queue";

export function createTenantCatalogService(manifestStore: ManifestStore): TenantCatalogService {
  return {
    async getManifest(orgId): Promise<CatalogManifest> {
      const existing = await manifestStore.get(orgId);
      if (existing) return existing;

      return {
        platform: { version: "1", hash: "init" },
        extensions: [],
      };
    },

    async setManifest(orgId, manifest) {
      await manifestStore.set(orgId, manifest);
    },

    async publishComponent(orgId, name, source) {
      const buildId = randomUUID();

      await manifestStore.setBuildStatus(buildId, "pending");

      const queue = getCatalogBuildQueue();
      await queue.add(
        `build-${orgId}-${name}`,
        {
          buildId,
          orgId,
          name,
          source,
          ...injectTraceCarrier(),
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        },
      );

      return { buildId };
    },

    async getBuildStatus(_orgId, buildId) {
      return manifestStore.getBuildStatus(buildId);
    },

    async removeComponent(orgId, _name) {
      await manifestStore.removeComponent(orgId, _name);
    },
  };
}
