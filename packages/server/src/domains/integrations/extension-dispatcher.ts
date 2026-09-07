import { randomUUID } from "node:crypto";
import { Worker } from "bullmq";
import { BULLMQ_QUEUES } from "../../shared/bullmq-queues";
import { getBullmqQueue } from "../../shared/bullmq-queue";
import { getRedisConnection } from "../../shared/redis";
import { signOutboundWebhook } from "../../shared/webhook-signing";
import { workerConcurrency, workersEnabled } from "../../shared/worker-runtime";
import { PROVIDER_EVENT_RECEIVED, type ProviderForwardedEvent } from "./provider-events";

export interface ExtensionBackend {
  extension: string;
  url: string;
  /**
   * Subscribed provider events as `integrationId/eventType` strings
   * (e.g. `stripe/checkout.session.completed`). Pure string matching —
   * the platform never interprets provider payloads.
   */
  events: string[];
}

export interface ExtensionDeliveryJob {
  orgId: string;
  extension: string;
  url: string;
  event: string;
  payload: Record<string, unknown>;
}

let warnedDevSecret = false;

/** Dispatch signing secret — MUST be set in production. */
export function extensionDispatchSecret(): string {
  const secret = process.env.EXTENSION_DISPATCH_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("EXTENSION_DISPATCH_SECRET is required in production");
  }
  if (!warnedDevSecret) {
    warnedDevSecret = true;
    console.warn("[extension-dispatcher] EXTENSION_DISPATCH_SECRET unset — using dev fallback");
  }
  return "dev_dispatch_secret";
}

/**
 * Platform-hosted extension backends (env-configured, one URL per extension
 * for all stores — never per-tenant). Remote backends get an install record
 * later; the dispatch contract below does not change.
 */
export function resolveExtensionBackends(): ExtensionBackend[] {
  const backends: ExtensionBackend[] = [];
  const commerceUrl = process.env.COMMERCE_BACKEND_URL?.trim();
  if (commerceUrl) {
    backends.push({
      extension: "commerce",
      url: commerceUrl,
      events: ["stripe/checkout.session.completed"],
    });
  }
  return backends;
}

export function getExtensionDeliveryQueue() {
  return getBullmqQueue<ExtensionDeliveryJob>(BULLMQ_QUEUES.EXTENSION_DELIVERY, {
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
}

/**
 * Forwards attributed provider events to installed extension backends.
 * Matching is pure `integrationId/eventType` string comparison; payloads
 * pass through untouched — mapping is each backend's job.
 * Install check + signing secret injected — no storage of its own.
 */
export function registerExtensionDispatcher(deps: {
  subscribe: (event: string, handler: (payload: unknown) => Promise<void>) => void;
  isExtensionInstalled: (orgId: string, extension: string) => Promise<boolean>;
  backends?: ExtensionBackend[];
  enqueue?: (job: ExtensionDeliveryJob) => Promise<void>;
}): void {
  const backends = deps.backends ?? resolveExtensionBackends();
  if (backends.length === 0) return;
  const enqueue =
    deps.enqueue ??
    ((job: ExtensionDeliveryJob) => {
      void getExtensionDeliveryQueue().add("deliver", job);
    });

  deps.subscribe(PROVIDER_EVENT_RECEIVED, async (rawPayload) => {
    const event = rawPayload as Partial<ProviderForwardedEvent>;
    if (
      !event ||
      typeof event.orgId !== "string" ||
      typeof event.integrationId !== "string" ||
      typeof event.eventType !== "string" ||
      typeof event.payload !== "object" ||
      !event.payload
    ) {
      return;
    }
    const key = `${event.integrationId}/${event.eventType}`;
    for (const backend of backends) {
      if (!backend.events.includes(key)) continue;
      if (!(await deps.isExtensionInstalled(event.orgId, backend.extension))) continue;
      await enqueue({
        orgId: event.orgId,
        extension: backend.extension,
        url: backend.url,
        event: key,
        payload: { ...event.payload },
      });
    }
  });
}

/** Worker: signed POST per delivery; throw on 5xx/timeout for BullMQ retry. */
export function startExtensionDeliveryWorker(): Worker<ExtensionDeliveryJob> | null {
  if (!workersEnabled()) return null;
  return new Worker<ExtensionDeliveryJob>(
    BULLMQ_QUEUES.EXTENSION_DELIVERY,
    async (job) => {
      const { orgId, extension, url, event, payload } = job.data;
      const body = JSON.stringify({ orgId, extension, event, payload });
      const headers = signOutboundWebhook(
        extensionDispatchSecret(),
        job.id ?? randomUUID(),
        Math.floor(Date.now() / 1000),
        body,
      );
      const response = await fetch(url, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        throw new Error(`Extension delivery failed with HTTP ${response.status}`);
      }
    },
    {
      connection: getRedisConnection(),
      concurrency: workerConcurrency("EXTENSION_DELIVERY_WORKER_CONCURRENCY", 8),
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  );
}
