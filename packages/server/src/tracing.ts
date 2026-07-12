import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace";

const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces";

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": "noname-server",
    "deployment.environment": process.env.NODE_ENV || "development",
  }),
  spanProcessors: [
    new BatchSpanProcessor({
      exporter: new OTLPTraceExporter({ url: otlpEndpoint }),
      maxQueueSize: 2048,
      maxExportBatchSize: 512,
      scheduledDelayMillis: 5000,
      exportTimeoutMillis: 30000,
    }),
  ],
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-http": { enabled: true },
      "@opentelemetry/instrumentation-pg": { enabled: true },
      "@opentelemetry/instrumentation-ioredis": { enabled: true },
      "@opentelemetry/instrumentation-aws-sdk": { enabled: true },
      "@opentelemetry/instrumentation-fs": { enabled: false },
      "@opentelemetry/instrumentation-dns": { enabled: false },
      "@opentelemetry/instrumentation-net": { enabled: false },
    }),
  ],
});

let started = false;

export function startTracing(): void {
  if (started) return;
  sdk.start();
  started = true;
  console.log(`[tracing] OTLP exporter → ${otlpEndpoint}`);
}

export async function stopTracing(): Promise<void> {
  await sdk.shutdown();
}

process.on("SIGTERM", () => {
  sdk.shutdown().catch(() => {});
});
