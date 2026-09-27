import type { ClickHouseClient } from "@clickhouse/client";
import { createClient } from "@clickhouse/client";
import { coerceScalarString } from "@noname/shared";
import { ServiceUnavailableError } from "../../../shared/domain-error";
import type {
  AnalyticsEventDTO,
  AnalyticsGroupBy,
  AnalyticsStorage,
  ReplaySessionIdentity,
  ReplayUserFilter,
  SegmentEventsInput,
  SegmentEventsResult,
} from "../ports";

function aggregateGroupColumn(groupBy: AnalyticsGroupBy | undefined): string {
  switch (groupBy) {
    case "sessionId":
      return "session_id";
    case "schemaId":
      return "schema_id";
    case "variantId":
      return "variant_id";
    case "audienceKey":
      return "audience_key";
    case "audienceDefinitionVersion":
      return "audience_definition_version";
    case "bindingId":
      return "binding_id";
    case "bindingVersion":
      return "binding_version";
    case "decisionId":
      return "decision_id";
    case "pageKey":
      return "page_key";
    case "locale":
      return "locale";
    default:
      return "event_type";
  }
}

function getClickHouseCredentials(): { username: string; password: string } {
  const username = process.env.CLICKHOUSE_USER;
  const password = process.env.CLICKHOUSE_PASSWORD;
  if (process.env.NODE_ENV === "production") {
    if (!username || !password) {
      throw new ServiceUnavailableError(
        "CLICKHOUSE_USER and CLICKHOUSE_PASSWORD are required in production",
      );
    }
    return { username, password };
  }
  return {
    username: username || "noname",
    password: password || "noname_dev",
  };
}

function getClickHouseClient(): ClickHouseClient {
  const url = process.env.CLICKHOUSE_URL || "http://localhost:8123";
  const { username, password } = getClickHouseCredentials();
  return createClient({
    url,
    username,
    password,
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
  audience_key Nullable(String),
  audience_definition_version Nullable(UInt32),
  binding_id Nullable(String),
  binding_version Nullable(UInt32),
  decision_id Nullable(String),
  page_key Nullable(String),
  locale Nullable(String),
  -- Legacy history only: retained for existing 90-day rows; new writes never populate it.
  context_hash Nullable(String),
  meta         String
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (org_id, event_type, timestamp)
TTL timestamp + INTERVAL 90 DAY
`;

// Safe in-place upgrade for pre-existing deployments: add nullable dimensions only.
// In particular, never drop/rename context_hash while its historical rows are retained.
const ADDITIVE_DIMENSION_DDL = [
  "ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS audience_key Nullable(String)",
  "ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS audience_definition_version Nullable(UInt32)",
  "ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS binding_id Nullable(String)",
  "ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS binding_version Nullable(UInt32)",
  "ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS decision_id Nullable(String)",
  "ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS page_key Nullable(String)",
  "ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS locale Nullable(String)",
];

export async function ensureClickHouseTable(): Promise<void> {
  if (!client) client = getClickHouseClient();
  await client.command({ query: DDL });
  for (const query of ADDITIVE_DIMENSION_DDL) {
    await client.command({ query });
  }
}

function toClickHouseTimestamp(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().replace("T", " ").replace("Z", "");
}

function uuidOrNull(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value;
}

/** ClickHouse `session_id` is non-nullable UUID — use nil UUID when absent. */
function sessionIdForRow(value: string | null | undefined): string {
  return uuidOrNull(value) ?? "00000000-0000-0000-0000-000000000000";
}

const NIL_SESSION_ID = "00000000-0000-0000-0000-000000000000";

function userMatchConditions(filter: ReplayUserFilter): {
  sql: string;
  params: Record<string, string>;
} {
  const parts: string[] = [];
  const params: Record<string, string> = {};
  if (filter.userId) {
    parts.push(`JSONExtractString(meta, 'userId') = {userId:String}`);
    params.userId = filter.userId;
  }
  if (filter.userEmail) {
    parts.push(`lower(JSONExtractString(meta, 'userEmail')) = {userEmail:String}`);
    params.userEmail = filter.userEmail.toLowerCase();
  }
  return { sql: parts.join(" OR "), params };
}

function toRow(e: AnalyticsEventDTO) {
  return {
    event_id: e.eventId,
    org_id: e.orgId,
    event_type: e.eventType,
    event_source: e.eventSource,
    timestamp: toClickHouseTimestamp(e.timestamp),
    session_id: sessionIdForRow(e.sessionId),
    schema_id: uuidOrNull(e.schemaId),
    variant_id: uuidOrNull(e.variantId),
    audience_key: e.audienceKey,
    audience_definition_version: e.audienceDefinitionVersion,
    binding_id: e.bindingId,
    binding_version: e.bindingVersion,
    decision_id: e.decisionId,
    page_key: e.pageKey,
    locale: e.locale,
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
    audienceKey: row.audience_key ? String(row.audience_key) : null,
    audienceDefinitionVersion:
      row.audience_definition_version == null ? null : Number(row.audience_definition_version),
    bindingId: row.binding_id ? String(row.binding_id) : null,
    bindingVersion: row.binding_version == null ? null : Number(row.binding_version),
    decisionId: row.decision_id ? String(row.decision_id) : null,
    pageKey: row.page_key ? String(row.page_key) : null,
    locale: row.locale ? String(row.locale) : null,
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
      if (filters.sessionIds && filters.sessionIds.length > 0) {
        conditions.push(`session_id IN {sessionIds:Array(String)}`);
      }
      if (filters.schemaId) conditions.push(`schema_id = {schemaId:String}`);
      if (filters.variantId) conditions.push(`variant_id = {variantId:String}`);
      if (filters.audienceKey) conditions.push(`audience_key = {audienceKey:String}`);
      if (filters.audienceDefinitionVersion != null) {
        conditions.push(`audience_definition_version = {audienceDefinitionVersion:UInt32}`);
      }
      if (filters.bindingId) conditions.push(`binding_id = {bindingId:String}`);
      if (filters.bindingVersion != null)
        conditions.push(`binding_version = {bindingVersion:UInt32}`);
      if (filters.decisionId) conditions.push(`decision_id = {decisionId:String}`);
      if (filters.pageKey) conditions.push(`page_key = {pageKey:String}`);
      if (filters.locale) conditions.push(`locale = {locale:String}`);

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
          sessionIds: filters.sessionIds,
          schemaId: filters.schemaId,
          variantId: filters.variantId,
          audienceKey: filters.audienceKey,
          audienceDefinitionVersion: filters.audienceDefinitionVersion,
          bindingId: filters.bindingId,
          bindingVersion: filters.bindingVersion,
          decisionId: filters.decisionId,
          pageKey: filters.pageKey,
          locale: filters.locale,
        },
      });
      const rows = await rs.json<Record<string, unknown>>();
      return rows.map((r: Record<string, unknown>) => fromRow(r));
    },

    async aggregate(filters) {
      const groupCol = aggregateGroupColumn(filters.groupBy);

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
        key: coerceScalarString(r.key, "null"),
        count: Number(r.count),
      }));
    },

    async conversionRates(filters) {
      const conditions = [`org_id = {orgId:String}`];
      if (filters.schemaId) conditions.push(`schema_id = {schemaId:String}`);
      if (filters.variantId) conditions.push(`variant_id = {variantId:String}`);
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
          variantId: filters.variantId,
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
            schema_id as schemaId,
            variant_id as variantId,
            audience_key as audienceKey,
            audience_definition_version as audienceDefinitionVersion,
            binding_id as bindingId,
            binding_version as bindingVersion,
            decision_id as decisionId,
            page_key as pageKey,
            locale,
            count(*) as count
          FROM analytics_events
          WHERE ${conditions.join(" AND ")}
          GROUP BY event_type, schema_id, variant_id, audience_key,
            audience_definition_version, binding_id, binding_version, decision_id, page_key, locale
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
        schemaId: string | null;
        variantId: string | null;
        audienceKey: string | null;
        audienceDefinitionVersion: string | number | null;
        bindingId: string | null;
        bindingVersion: string | number | null;
        decisionId: string | null;
        pageKey: string | null;
        locale: string | null;
        count: string;
      }>();

      const clusters = clusterRows.map((r) => ({
        eventType: r.eventType,
        schemaId: r.schemaId ?? null,
        variantId: r.variantId ?? null,
        audienceKey: r.audienceKey ?? null,
        audienceDefinitionVersion:
          r.audienceDefinitionVersion == null ? null : Number(r.audienceDefinitionVersion),
        bindingId: r.bindingId ?? null,
        bindingVersion: r.bindingVersion == null ? null : Number(r.bindingVersion),
        decisionId: r.decisionId ?? null,
        pageKey: r.pageKey ?? null,
        locale: r.locale ?? null,
        count: Number(r.count),
        avgMeta: {} as Record<string, number>,
      }));

      return { clusters, totalEvents };
    },

    async listReplaySessionIdsForUser(orgId, filter) {
      const { sql, params } = userMatchConditions(filter);
      if (!sql) return [];

      const rs = await client!.query({
        query: `
          SELECT DISTINCT session_id AS sessionId
          FROM analytics_events
          WHERE org_id = {orgId:String}
            AND session_id != {nilSessionId:String}
            AND (${sql})
          ORDER BY sessionId DESC
          LIMIT 500
        `,
        format: "JSONEachRow",
        query_params: {
          orgId,
          nilSessionId: NIL_SESSION_ID,
          ...params,
        },
      });
      const rows = await rs.json<{ sessionId: string }>();
      return rows.map((r) => String(r.sessionId));
    },

    async loadReplaySessionIdentities(orgId, sessionIds) {
      if (sessionIds.length === 0) return {};

      const rs = await client!.query({
        query: `
          SELECT
            session_id AS sessionId,
            nullIf(anyIf(JSONExtractString(meta, 'userId'), JSONExtractString(meta, 'userId') != ''), '') AS userId,
            nullIf(anyIf(JSONExtractString(meta, 'userEmail'), JSONExtractString(meta, 'userEmail') != ''), '') AS userEmail,
            max(event_type = 'user_identified') AS identifiedMidSession
          FROM analytics_events
          WHERE org_id = {orgId:String}
            AND session_id IN {sessionIds:Array(String)}
          GROUP BY session_id
        `,
        format: "JSONEachRow",
        query_params: { orgId, sessionIds },
      });
      const rows = await rs.json<{
        sessionId: string;
        userId: string | null;
        userEmail: string | null;
        identifiedMidSession: number | boolean;
      }>();

      const out: Record<string, ReplaySessionIdentity> = {};
      for (const row of rows) {
        out[String(row.sessionId)] = {
          userId: row.userId ?? null,
          userEmail: row.userEmail ?? null,
          identifiedMidSession: Boolean(row.identifiedMidSession),
        };
      }
      return out;
    },
  };
}
