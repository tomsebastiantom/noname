import { beforeEach, describe, expect, it, vi } from "vitest";

const clickhouseClient = vi.hoisted(() => ({
  command: vi.fn(async () => ({})),
  insert: vi.fn(async () => ({})),
  query: vi.fn(),
}));

vi.mock("@clickhouse/client", () => ({
  createClient: vi.fn(() => clickhouseClient),
}));

import { createClickHouseAnalyticsStorage, ensureClickHouseTable } from "./clickhouse";

const sampleEvent = {
  eventId: "11111111-2222-4333-8444-555555555555",
  orgId: "org-1",
  eventType: "experience.served",
  eventSource: "server" as const,
  timestamp: new Date("2026-08-01T12:00:00.000Z"),
  sessionId: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  schemaId: "33333333-4444-4555-8666-777777777777",
  variantId: "buyer_smoke_1790732519554",
  audienceKey: "returning-customer",
  audienceDefinitionVersion: 12,
  bindingId: "binding-42",
  bindingVersion: 5,
  decisionId: "decision-99",
  pageKey: "/products/widget",
  locale: "en-US",
  meta: { source: "edge" },
};

beforeEach(() => {
  clickhouseClient.command.mockClear();
  clickhouseClient.insert.mockClear();
  clickhouseClient.query.mockReset();
});

describe("ClickHouse analytics dimensions", () => {
  it("uses additive DDL and leaves legacy history column untouched", async () => {
    await ensureClickHouseTable();

    const statements = clickhouseClient.command.mock.calls.map(([arg]) => arg.query);
    expect(statements[0]).toContain("CREATE TABLE IF NOT EXISTS analytics_events");
    expect(statements[0]).toContain("context_hash Nullable(String)");
    expect(statements[0]).toContain("variant_id   Nullable(String)");
    expect(statements.join("\n")).toContain("MODIFY COLUMN variant_id Nullable(String)");
    expect(statements.join("\n")).toContain(
      "ADD COLUMN IF NOT EXISTS audience_key Nullable(String)",
    );
    expect(statements.join("\n")).toContain(
      "ADD COLUMN IF NOT EXISTS audience_definition_version Nullable(UInt32)",
    );
    expect(statements.join("\n")).toContain("ADD COLUMN IF NOT EXISTS binding_id Nullable(String)");
    expect(statements.join("\n")).toContain(
      "ADD COLUMN IF NOT EXISTS decision_id Nullable(String)",
    );
    expect(statements.some((query) => /DROP\s+COLUMN|TRUNCATE|DROP\s+TABLE/i.test(query))).toBe(
      false,
    );
  });

  it("writes and reads explicit attribution dimensions without the legacy hash", async () => {
    const storage = createClickHouseAnalyticsStorage();
    await storage.ingest(sampleEvent);

    const insert = clickhouseClient.insert.mock.calls[0]?.[0];
    const row = insert.values[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      variant_id: "buyer_smoke_1790732519554",
      audience_key: "returning-customer",
      audience_definition_version: 12,
      binding_id: "binding-42",
      binding_version: 5,
      decision_id: "decision-99",
      page_key: "/products/widget",
      locale: "en-US",
    });
    expect(row).not.toHaveProperty("context_hash");

    clickhouseClient.query.mockResolvedValue({
      json: vi.fn(async () => [
        {
          event_id: sampleEvent.eventId,
          org_id: sampleEvent.orgId,
          event_type: sampleEvent.eventType,
          event_source: sampleEvent.eventSource,
          timestamp: "2026-08-01 12:00:00.000",
          session_id: sampleEvent.sessionId,
          schema_id: sampleEvent.schemaId,
          variant_id: sampleEvent.variantId,
          audience_key: sampleEvent.audienceKey,
          audience_definition_version: "12",
          binding_id: sampleEvent.bindingId,
          binding_version: "5",
          decision_id: sampleEvent.decisionId,
          page_key: sampleEvent.pageKey,
          locale: sampleEvent.locale,
          context_hash: "historical-only",
          meta: JSON.stringify(sampleEvent.meta),
        },
      ]),
    });
    const events = await storage.query({
      orgId: "org-1",
      audienceKey: "returning-customer",
      audienceDefinitionVersion: 12,
      bindingId: "binding-42",
      bindingVersion: 5,
      decisionId: "decision-99",
      pageKey: "/products/widget",
      locale: "en-US",
    });

    expect(events[0]).toMatchObject({
      audienceKey: "returning-customer",
      audienceDefinitionVersion: 12,
      bindingId: "binding-42",
      bindingVersion: 5,
      decisionId: "decision-99",
      pageKey: "/products/widget",
      locale: "en-US",
    });
    expect(events[0]).not.toHaveProperty("contextHash");
    const query = clickhouseClient.query.mock.calls[0]?.[0].query as string;
    expect(query).toContain("audience_key = {audienceKey:String}");
    expect(query).toContain("binding_version = {bindingVersion:UInt32}");
    expect(query).not.toContain("context_hash");
  });

  it("supports named grouping and segment clusters", async () => {
    const storage = createClickHouseAnalyticsStorage();
    clickhouseClient.query.mockResolvedValue({
      json: vi.fn(async () => [{ key: "returning-customer", count: "3" }]),
    });

    await expect(storage.aggregate({ orgId: "org-1", groupBy: "audienceKey" })).resolves.toEqual([
      { key: "returning-customer", count: 3 },
    ]);
    const aggregateQuery = clickhouseClient.query.mock.calls[0]?.[0].query as string;
    expect(aggregateQuery).toContain("audience_key");
    expect(aggregateQuery).not.toContain("context_hash");

    clickhouseClient.query.mockResolvedValueOnce({ json: vi.fn(async () => [{ total: "3" }]) });
    clickhouseClient.query.mockResolvedValueOnce({
      json: vi.fn(async () => [
        {
          eventType: "experience.served",
          schemaId: sampleEvent.schemaId,
          variantId: sampleEvent.variantId,
          audienceKey: "returning-customer",
          audienceDefinitionVersion: "12",
          bindingId: "binding-42",
          bindingVersion: "5",
          decisionId: "decision-99",
          pageKey: "/products/widget",
          locale: "en-US",
          count: "3",
        },
      ]),
    });
    const clusters = await storage.segmentEvents({ orgId: "org-1" });
    expect(clusters.clusters[0]).toMatchObject({
      audienceKey: "returning-customer",
      audienceDefinitionVersion: 12,
      bindingId: "binding-42",
      bindingVersion: 5,
      decisionId: "decision-99",
      pageKey: "/products/widget",
      locale: "en-US",
      count: 3,
    });
    expect(clickhouseClient.query.mock.calls[2]?.[0].query).not.toContain("context_hash");
  });
});
