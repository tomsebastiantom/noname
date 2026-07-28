import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getRedisConnection } from "../../shared/redis";
import { bundleCatalog } from "./adapters/bundler";
import type { ManifestStore } from "./adapters/manifest-store";
import type { CatalogBundleStorage } from "./adapters/r2";
import type { CatalogBuildJobData } from "./queue";

export function startCatalogBuildWorker(
  storage: CatalogBundleStorage,
  manifestStore: ManifestStore,
): Worker<CatalogBuildJobData> {
  const worker = new Worker<CatalogBuildJobData>(
    BULLMQ_QUEUES.CATALOG,
    async (job) => {
      const { buildId, orgId, name, source } = job.data;

      await manifestStore.setBuildStatus(buildId, "running");

      try {
        const output = await bundleCatalog({
          scope: `tenant-${orgId}-${name}`,
          source,
        });

        const prefix = `tenants/${orgId}`;

        const entryUrl = await storage.put(
          `${prefix}/${output.remoteEntry.filename}`,
          output.remoteEntry.content,
          "application/javascript",
        );

        await storage.put(
          `${prefix}/${output.catalog.filename}`,
          output.catalog.content,
          "application/javascript",
        );

        await manifestStore.addComponent(orgId, {
          name: orgId,
          url: entryUrl,
          hash: output.hash,
          version: 1,
        });

        await manifestStore.setBuildStatus(buildId, "completed", {
          remoteEntry: { filename: output.remoteEntry.filename, url: entryUrl },
          hash: output.hash,
        });
      } catch (err) {
        await manifestStore.setBuildStatus(buildId, "failed", {
          error: err instanceof Error ? err.message : "unknown error",
        });
        throw err;
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: 2,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  );

  return worker;
}
