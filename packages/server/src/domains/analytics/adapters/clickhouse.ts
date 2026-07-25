import type { ClickHouseClient } from "@clickhouse/client";
import { createClient } from "@clickhouse/client";
import type {
  AnalyticsEventDTO,
  AnalyticsStorage,
  SegmentEventsInput,
  SegmentEventsResult,
} from "../ports";

function getClickHouseClient(): ClickHouseClient {
  const url = process.env.CLICKHOUSE_URL || "http://localhost:8123";
  return createClient({
    url,
    username: process.env.CLICKHOUSE_USER || "noname",
    password: process.env.CLICKHOUSE_PASSWORD || "noname_dev",
    database: process.env.CLICKHOUSE_DB || "app",
    request_timeout: 10_000,
  });
}

let client: ClickHouseClient | null = null;

const DDL = `
CREATE TABLE IF NOT EXISTS analytics_events (
  event_id     UUID,
  org_id    String,
  event_type   LowCardinality(String),
  event_source LowCardinality(String),
  timestamp    DateTime64(3, 'UTC'),
  session_id   UUID,
  schema_id    Nullable(UUID),
  variant_id   Nullable(UUID),
  context_hash Nullable(String),
  meta         String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (org_id, event_type, timestamp)
TTL timestamp + INTERVAL 90 DAY
`;

export async function ensureClickHouseTable(): Promise<void> {
  if (!client) client = getClickHouseClient();
  await client.command({ query: DDL });
}

function toRow(e: AnalyticsEventDTO) {
  return {
    event_id: e.eventId,
    org_id: e.orgId,
    event_type: e.eventType,
    event_source: e.eventSource,
    timestamp: e.timestamp.toISOString().replace("T", " ").replace("Z", ""),
    session_id: e.sessionId,
    schema_id: e.schemaId ?? null,
    variant_id: e.variantId ?? null,
    context_hash: e.contextHash ?? null,
    meta: JSON.stringify(e.meta),
  };
}

function fromRow(row: Record<string, unknown>): AnalyticsEventDTO {
  return {
    eventId: String(row.event_id),
    orgId: String(row.org_id),
    eventType: String(row.event_type),
    eventSource: row.event_source as "server" | "frontend",
    timestamp: new Date(String(row.timestamp)),
    sessionId: String(row.session_id),
    schemaId: row.schema_id ? String(row.schema_id) : null,
    variantId: row.variant_id ? String(row.variant_id) : null,
    contextHash: row.context_hash ? String(row.context_hash) : null,
    meta:
      typeof row.meta === "string"
        ? JSON.parse(String(row.meta))
        : (row.meta as Record<string, unknown>),
  };
}

export function createClickHouseAnalyticsStorage(): AnalyticsStorage {
  if (!client) client = getClickHouseClient();

  return {
    async ingest(event) {
      await client!.insert({
        table: "analytics_events",
        values: [toRow(event)],
        format: "JSONEachRow",
      });
    },

    async ingestBatch(events) {
      if (events.length === 0) return;
      await client!.insert({
        table: "analytics_events",
        values: events.map(toRow),
        format: "JSONEachRow",
      });
    },

    async query(filters) {
      const conditions: string[] = [];
      if (filters.orgId) conditions.push(`org_id = {orgId:String}`);
      if (filters.eventType) conditions.push(`event_type = {eventType:String}`);
      if (filters.eventSource) conditions.push(`event_source = {eventSource:String}`);
      if (filters.from) conditions.push(`timestamp >= {from:DateTime64(3)}`);
      if (filters.to) conditions.push(`timestamp <= {to:DateTime64(3)}`);
      if (filters.sessionId) conditions.push(`session_id = {sessionId:String}`);
      if (filters.schemaId) conditions.push(`schema_id = {schemaId:String}`);
      if (filters.variantId) conditions.push(`variant_id = {variantId:String}`);
      if (filters.contextHash) conditions.push(`context_hash = {contextHash:String}`);

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = filters.limit ?? 100;
      const offset = filters.offset ?? 0;

      const rs = await client!.query({
        query: `SELECT * FROM analytics_events ${where} ORDER BY timestamp DESC LIMIT ${limit} OFFSET ${offset}`,
        format: "JSONEachRow",
        query_params: {
          orgId: filters.orgId,
          eventType: filters.eventType,
          eventSource: filters.eventSource,
          from: filters.from?.toISOString().replace("T", " ").replace("Z", ""),
          to: filters.to?.toISOString().replace("T", " ").replace("Z", ""),
          sessionId: filters.sessionId,
          schemaId: filters.schemaId,
          variantId: filters.variantId,
          contextHash: filters.contextHash,
        },
      });
      const rows = await rs.json<Record<string, unknown>>();
      return rows.map((r: Record<string, unknown>) => fromRow(r));
    },

    async aggregate(filters) {
      const groupCol =
        filters.groupBy === "eventType"
          ? "event_type"
          : filters.groupBy === "sessionId"
            ? "session_id"
            : filters.groupBy === "schemaId"
              ? "schema_id"
              : filters.groupBy === "contextHash"
                ? "context_hash"
                : "event_type";

      const conditions = [`org_id = {orgId:String}`];
      if (filters.from) conditions.push(`timestamp >= {from:DateTime64(3)}`);
      if (filters.to) conditions.push(`timestamp <= {to:DateTime64(3)}`);

      const rs = await client!.query({
        query: `
          SELECT
            ${groupCol} as key,
            count(*) as count
          FROM analytics_events
          WHERE ${conditions.join(" AND ")}
          GROUP BY ${groupCol}
          ORDER BY count DESC
          LIMIT {limit:UInt32}
        `,
        format: "JSONEachRow",
        query_params: {
          orgId: filters.orgId,
          from: filters.from?.toISOString().replace("T", " ").replace("Z", ""),
          to: filters.to?.toISOString().replace("T", " ").replace("Z", ""),
          limit: filters.limit ?? 20,
        },
      });
      const rows = await rs.json<{ key: string | null; count: string }>();
      return rows.map((r: { key: string | null; count: string }) => ({
        key: String(r.key ?? "null"),
        count: Number(r.count),
      }));
    },

    async conversionRates(filters) {
      const conditions = [`org_id = {orgId:String}`];
      if (filters.schemaId) conditions.push(`schema_id = {schemaId:String}`);
      if (filters.from) conditions.push(`timestamp >= {from:DateTime64(3)}`);
      if (filters.to) conditions.push(`timestamp <= {to:DateTime64(3)}`);

      const rs = await client!.query({
        query: `
          SELECT
            variant_id as variantId,
            countIf(event_type = 'impression') as impressions,
            countIf(event_type = 'conversion') as conversions,
            if(
              countIf(event_type = 'impression') > 0,
              countIf(event_type = 'conversion') / countIf(event_type = 'impression'),
              0
            ) as rate
          FROM analytics_events
          WHERE ${conditions.join(" AND ")}
          GROUP BY variantId
          ORDER BY rate DESC
        `,
        format: "JSONEachRow",
        query_params: {
          orgId: filters.orgId,
          schemaId: filters.schemaId,
          from: filters.from?.toISOString().replace("T", " ").replace("Z", ""),
          to: filters.to?.toISOString().replace("T", " ").replace("Z", ""),
        },
      });
      const rows = await rs.json<{
        variantId: string | null;
        impressions: string;
        conversions: string;
        rate: string;
      }>();
      return rows.map(
        (r: {
          variantId: string | null;
          impressions: string;
          conversions: string;
          rate: string;
        }) => ({
          variantId: r.variantId || null,
          impressions: Number(r.impressions),
          conversions: Number(r.conversions),
          rate: Number(r.rate),
        }),
      );
    },

    async segmentEvents(filters: SegmentEventsInput): Promise<SegmentEventsResult> {
      const conditions = [`org_id = {orgId:String}`];
      if (filters.from) conditions.push(`timestamp >= {from:DateTime64(3)}`);
      if (filters.to) conditions.push(`timestamp <= {to:DateTime64(3)}`);

      const totalRs = await client!.query({
        query: `SELECT count(*) as total FROM analytics_events WHERE ${conditions.join(" AND ")}`,
        format: "JSONEachRow",
        query_params: {
          orgId: filters.orgId,
          from: filters.from?.toISOString().replace("T", " ").replace("Z", ""),
          to: filters.to?.toISOString().replace("T", " ").replace("Z", ""),
        },
      });
      const totalRows = await totalRs.json<{ total: string }>();
      const totalEvents = Number(totalRows[0]?.total ?? "0");

      const clusterRs = await client!.query({
        query: `
          SELECT
            event_type as eventType,
            context_hash as contextHash,
            count(*) as count
          FROM analytics_events
          WHERE ${conditions.join(" AND ")}
          GROUP BY event_type, context_hash
          ORDER BY count DESC
          LIMIT {limit:UInt32}
        `,
        format: "JSONEachRow",
        query_params: {
          orgId: filters.orgId,
          from: filters.from?.toISOString().replace("T", " ").replace("Z", ""),
          to: filters.to?.toISOString().replace("T", " ").replace("Z", ""),
          limit: filters.limit ?? 50,
        },
      });
      const clusterRows = await clusterRs.json<{
        eventType: string;
        contextHash: string | null;
        count: string;
      }>();

      const clusters = clusterRows.map((r) => ({
        eventType: r.eventType,
        contextHash: r.contextHash ?? null,
        count: Number(r.count),
        avgMeta: {} as Record<string, number>,
      }));

      return { clusters, totalEvents };
    },
  };
}
