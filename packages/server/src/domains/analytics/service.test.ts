import type { Queue } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import type { AnalyticsEventDTO, AnalyticsStorage } from "./ports";
import { createAnalyticsService } from "./service";

const UUID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function createTestService() {
  const storage = {
    ingest: vi.fn(async (_event: AnalyticsEventDTO) => {}),
  } as unknown as AnalyticsStorage;
  const queue = {
    add: vi.fn(async (_name: string, _event: AnalyticsEventDTO) => {}),
  } as unknown as Queue<AnalyticsEventDTO>;
  return { service: createAnalyticsService(storage, queue), storage, queue };
}

describe("analytics server event dimensions", () => {
  it("retains trusted experience attribution and a validated session id", async () => {
    const { service, queue } = createTestService();
    await service.ingestServerEvent("experience.served", {
      orgId: "org-1",
      sessionId: UUID,
      audienceKey: "returning-customer",
      audienceDefinitionVersion: 12,
      bindingId: "binding-42",
      bindingVersion: 5,
      decisionId: "decision-99",
      pageKey: "/products/widget",
      locale: "en-US",
      schemaId: "11111111-2222-4333-8444-555555555555",
      variantId: "66666666-7777-4888-8999-aaaaaaaaaaaa",
    });

    expect(queue.add).toHaveBeenCalledWith(
      "ingest",
      expect.objectContaining({
        eventType: "experience.served",
        eventSource: "server",
        sessionId: UUID,
        audienceKey: "returning-customer",
        audienceDefinitionVersion: 12,
        bindingId: "binding-42",
        bindingVersion: 5,
        decisionId: "decision-99",
        pageKey: "/products/widget",
        locale: "en-US",
        schemaId: "11111111-2222-4333-8444-555555555555",
        variantId: "66666666-7777-4888-8999-aaaaaaaaaaaa",
      }),
    );
  });

  it("retains named dimensions on trusted server outcomes and rejects malformed session IDs", async () => {
    const { service, queue } = createTestService();
    await service.ingestServerEvent("commerce.order.paid", {
      orgId: "org-1",
      sessionId: "not-a-uuid",
      audienceKey: "returning-customer",
      audienceDefinitionVersion: 12,
      bindingId: "binding-42",
      bindingVersion: 5,
      decisionId: "decision-99",
      pageKey: "/products/widget",
      locale: "en-US",
    });

    expect(queue.add).toHaveBeenCalledWith(
      "ingest",
      expect.objectContaining({
        eventType: "commerce.order.paid",
        eventSource: "server",
        sessionId: "",
        audienceKey: "returning-customer",
        audienceDefinitionVersion: 12,
        bindingId: "binding-42",
        bindingVersion: 5,
        decisionId: "decision-99",
        pageKey: "/products/widget",
        locale: "en-US",
      }),
    );
  });

  it("never copies server-owned attribution supplied to frontend track", async () => {
    const { service, queue } = createTestService();
    await service.track("org-1", {
      eventType: "page_view",
      sessionId: UUID,
      audienceKey: "client-claim",
      audienceDefinitionVersion: 999,
      bindingId: "client-binding",
      bindingVersion: 999,
      decisionId: "client-decision",
      pageKey: "/spoofed",
      locale: "xx-XX",
    });

    expect(queue.add).toHaveBeenCalledWith(
      "ingest",
      expect.objectContaining({
        eventSource: "frontend",
        audienceKey: null,
        audienceDefinitionVersion: null,
        bindingId: null,
        bindingVersion: null,
        decisionId: null,
        pageKey: null,
        locale: null,
      }),
    );
  });
});
