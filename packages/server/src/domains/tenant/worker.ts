import { context, propagation, SpanStatusCode, trace } from "@opentelemetry/api";
import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getRedisConnection } from "../../shared/redis";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import { bundleCatalog } from "./adapters/bundler";
import type { ManifestStore } from "./adapters/manifest-store";
import type { CatalogBundleStorage } from "./adapters/r2";
import type { CatalogBuildJobData } from "./queue";

const tracer = trace.getTracer("tenant-catalog-worker");

export function startCatalogBuildWorker(
  storage: CatalogBundleStorage,
  manifestStore: ManifestStore,
): Worker<CatalogBuildJobData> | null {
  if (!workersEnabled()) return null;

  const worker = new Worker<CatalogBuildJobData>(
    BULLMQ_QUEUES.CATALOG,
    async (job) => {
      const { buildId, orgId, name, source, traceparent, tracestate } = job.data;

      const parentContext = traceparent
        ? propagation.extract(context.active(), { traceparent, tracestate })
        : context.active();

      return context.with(parentContext, () =>
        tracer.startActiveSpan("tenant.catalog.build", async (span) => {
          try {
            span.setAttribute("tenant.build_id", buildId);
            span.setAttribute("tenant.org_id", orgId);
            span.setAttribute("tenant.component", name);

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
              span.recordException(err as Error);
              span.setStatus({ code: SpanStatusCode.ERROR });
              await manifestStore.setBuildStatus(buildId, "failed", {
                error: err instanceof Error ? err.message : "unknown error",
              });
              throw err;
            }
          } finally {
            span.end();
          }
        }),
      );
    },
    {
      connection: getRedisConnection(),
      concurrency: workerConcurrency("CATALOG_WORKER_CONCURRENCY", 2),
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  );

  return worker;
}
