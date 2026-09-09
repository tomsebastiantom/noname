import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startAgentWorker } from "./agent/worker";
import { startAnalyticsWorker } from "./analytics/worker";
import { startEmailOutboundWorker } from "./notifications/worker";
import { startCatalogBuildWorker } from "./tenant/worker";
import { startWebhookOutboundWorker } from "./webhooks/outbound-worker";

describe("background workers respect RUN_WORKERS=false", () => {
  beforeEach(() => {
    process.env.RUN_WORKERS = "false";
  });

  afterEach(() => {
    delete process.env.RUN_WORKERS;
  });

  it("startAgentWorker returns null", () => {
    expect(startAgentWorker({} as never, {} as never)).toBeNull();
  });

  it("startWebhookOutboundWorker returns null", () => {
    expect(startWebhookOutboundWorker({ storage: {} as never, secrets: {} as never })).toBeNull();
  });

  it("startEmailOutboundWorker returns null", () => {
    expect(startEmailOutboundWorker({ storage: {} as never, secrets: {} as never })).toBeNull();
  });

  it("startCatalogBuildWorker returns null", () => {
    expect(startCatalogBuildWorker({} as never, {} as never)).toBeNull();
  });

  it("startAnalyticsWorker returns null", () => {
    expect(startAnalyticsWorker({} as never)).toBeNull();
  });
});
