import { randomUUID } from "node:crypto";
import { context, propagation } from "@opentelemetry/api";
import type { TenantCatalogService, CatalogManifest } from "./ports";
import type { ManifestStore } from "./adapters/manifest-store";
import { getCatalogBuildQueue } from "./queue";

export function createTenantCatalogService(
  manifestStore: ManifestStore,
): TenantCatalogService {
  return {
    async getManifest(tenantId): Promise<CatalogManifest> {
      const existing = await manifestStore.get(tenantId);
      if (existing) return existing;

      return {
        platform: { version: "1", hash: "init" },
      };
    },

    async publishComponent(tenantId, name, source) {
      const buildId = randomUUID();
      const carrier: Record<string, string> = {};
      propagation.inject(context.active(), carrier);

      await manifestStore.setBuildStatus(buildId, "pending");

      const queue = getCatalogBuildQueue();
      await queue.add(
        `build-${tenantId}-${name}`,
        {
          buildId,
          tenantId,
          name,
          source,
          traceparent: carrier.traceparent,
          tracestate: carrier.tracestate,
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        },
      );

      return { buildId };
    },

    async getBuildStatus(_tenantId, buildId) {
      return manifestStore.getBuildStatus(buildId);
    },

    async removeComponent(tenantId, _name) {
      await manifestStore.removeComponent(tenantId, _name);
    },
  };
}
