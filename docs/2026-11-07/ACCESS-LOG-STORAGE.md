# Where access logs live

> **Status:** proposed design · **Date:** 2026-11-07 (America/Toronto)
> **Question:** we need request/access logs (who called which route, status, latency). Evidence and audit are not
> the right stores. Where do they go?
> **Related:** [`AUDIT-LOGGING-DESIGN.md`](./AUDIT-LOGGING-DESIGN.md) §4.7 (three planes) · [`PLATFORM-OPERATOR-DESIGN.md`](./PLATFORM-OPERATOR-DESIGN.md)

---

## 1. Why not Evidence, audit, or the release domain

| Store | Why it is wrong for access logs |
|---|---|
| **Evidence** | business facts, immutable, tenant-visible, long retention; access logs are high-volume operational telemetry with PII risk |
| **Audit** | privileged **actions**, low volume, 7-year retention; an access log records *every* request, including reads |
| **Release domain** | release identity only; a log store is not a domain aggregate |
| **Jaeger** | traces, not logs: no log query language, short retention, and it is not built for per-request rows |

They are different planes. Mixing them makes the audit kernel unusable and the log store unauditable.

## 1a. Priority — access logs do **not** answer “who edited an admin”

The reason to build access logs is **not** “we are adding platform roles”. That question is answered by the
**audit** stream, which is a different control plane.

| Question | Record | Store | Owner |
|---|---|---|---|
| who changed a role / token / tenant pointer, and why? | **audit** (control plane) | Postgres `evidence_audit_events` | privileged commands |
| what requests hit the API, with status and latency? | **access log** (data plane) | ClickHouse | middleware |
| what is true about an order/release? | **Evidence** | Postgres | domains |
| where did time go in one request? | **trace** | Jaeger | OTel |

This is exactly how the large providers split it:

- **AWS CloudTrail** records **management events** — IAM/role/policy changes (“control plane operations”) —
  separately from high-volume data-plane activity ([CloudTrail concepts](https://docs.aws.amazon.com/awscloudtrail/latest/userguide/cloudtrail-concepts.html)).
- **Cloudflare Audit Logs** record account/zone configuration changes and logins, while **HTTP request logs** go
  through Logpush to storage/SIEM ([Audit Logs](https://developers.cloudflare.com/fundamentals/account/account-security/review-audit-logs/), [Logpush](https://developers.cloudflare.com/logs/logpush/)).
- **Kubernetes** audit records *who did what to the API*, not container stdout; they use different backends.
- **GitHub** keeps an enterprise/org **audit log** for member/role/repo actions ([audit log](https://docs.github.com/en/enterprise-cloud@latest/admin/concepts/security-and-compliance/audit-log-for-an-enterprise)).

**Therefore:** implement the **audit** phases A–C (see [`AUDIT-LOGGING-DESIGN.md`](./AUDIT-LOGGING-DESIGN.md))
before access-log infrastructure. Access logs are for SOC 2 **CC7.2 monitoring / incident forensics**, and they
become useful only after request IDs and structured principals exist.



| Option | How it works | Pros | Cons |
|---|---|---|---|
| **A. PostgreSQL partitioned table** | `access_logs` partitioned by day, TTL by drop partition | one database, transactional | index bloat, vacuum cost, poor at high volume; competes with app traffic |
| **B. ClickHouse** (already running) | `http_access_logs` table, `MergeTree`, daily partitions, TTL | columnar, TTL, SQL, high volume, already in compose | one more writer path; not a log-search UI |
| **C. Grafana Loki + object store** | structured JSON → Alloy/Promtail → Loki chunks in S3 | log-native, labels, cheap long-term, Grafana | a new service to operate; no existing Loki in compose |
| **D. Object storage only (R2/S3)** | edge/API writes NDJSON batches; query with ClickHouse/Athena later | cheapest WORM, perfect for compliance export | not live-queryable on its own |
| **E. SIEM (Datadog/Splunk)** | ship logs to vendor | compliance dashboards | cost, vendor lock-in |
| **F. Jaeger** | trace spans only | already there | wrong shape; not a log store |

## 3. Recommendation

**B now, D as the long-term archive, C only if log search becomes a product need.**

ClickHouse is already running for analytics with a working adapter (`domains/analytics/adapters/clickhouse.ts`),
so access logs add a table and a writer, not a new service. Jaeger stays for traces; the access-log row carries the
`trace_id` so you can jump from a request row to its trace.

```
request → requestId middleware → access-log middleware
        → batch writer (async, drop-on-failure)
        → ClickHouse http_access_logs (TTL 90 days)
        → daily export to R2/S3 NDJSON (retain 1 year / WORM)
```

The request must **never block** on logging: if ClickHouse is unavailable, increment a drop counter and continue.

## 4. Table shape

```sql
CREATE TABLE IF NOT EXISTS http_access_logs (
  ts           DateTime64(3, 'UTC'),
  request_id   String,
  trace_id     String,
  org_id       String,
  actor_type   LowCardinality(String),  -- user | service | system | anonymous
  actor_id     String,
  method       LowCardinality(String),
  route        LowCardinality(String),  -- normalised route, not raw URL
  status       UInt16,
  duration_ms  UInt32,
  bytes        UInt32,
  ip_hash      String,                  -- hashed, never raw IP
  ua_hash      String
)
ENGINE = MergeTree
PARTITION BY toDate(ts)
ORDER BY (org_id, ts)
TTL toDateTime(ts) + INTERVAL 90 DAY;
```

Rules:

- log **route patterns** (`/api/releases/:id/promote`), not raw URLs (cardinality, PII in query strings);
- never log bodies, tokens, cookies, or query values;
- hash IP/UA; keep the hash key in the app secret;
- 4xx/5xx always logged; 2xx may be sampled **only** if volume demands it (never sample errors).

## 5. How established projects do it

| Project | Pattern | Lesson |
|---|---|---|
| **Cloudflare** | Logpush ships HTTP request logs to R2/S3/SIEM; it “does not offer storage or search” itself ([Logpush](https://developers.cloudflare.com/logs/logpush/)) | separate collection from storage; push to a sink |
| **Kubernetes** | audit logs written to files or a webhook backend, not etcd ([audit](https://kubernetes.io/docs/tasks/debug/debug-cluster/audit/)) | never put high-volume logs in the transactional store |
| **Grafana Loki** | indexes only labels; log chunks live in object storage ([Loki](https://grafana.com/docs/loki/latest/get-started/overview/)) | cheap long-term log storage is object storage + small index |
| **ClickHouse** | MergeTree + partition + TTL is the standard pattern for request logs | one engine for high-volume SQL over logs |
| **Envoy/Nginx** | access logs to stdout → collector → log backend | the app emits; the pipeline stores |

The consistent pattern: **application emits structured events; a dedicated log store handles volume and retention;
the transactional database keeps only audit/evidence.**

## 6. Tenant visibility

Raw access logs stay **operator-only**. Tenants see:

- their **audit** stream (privileged actions affecting them);
- their **Evidence** (business facts);
- aggregate request metrics if a product surface needs them.

Never expose raw access logs to tenants: they contain other users’ IP hashes, paths, and traffic patterns.

## 7. Implementation plan

**Ordering rule:** this plan starts **after** audit phases A–C. Access logs are not a prerequisite for the
platform-operator identity; the audit stream is.

| Phase | Change | Acceptance |
|---|---|---|
| **1** | `requestId` middleware (accept `x-request-id`, else UUID; echo response; set span attribute) | every response has a request id; audit rows carry it |
| **2** | access-log middleware (route, status, duration, org, actor, requestId, traceId; no bodies) | a request produces exactly one row in the sink |
| **3** | ClickHouse DDL + batched async writer + drop metric | ClickHouse down → requests still 200; drop counter rises |
| **4** | TTL 90d + daily NDJSON export to R2/S3 (1y) | export object exists; rows expire |
| **5** | dashboards/alerts (5xx rate, p95 by route) + PII review | alert fires on injected 500s |

Phase 1 is shared with the audit design; phase 2 must not precede phase 1.

## 8. What this does not solve

- It does not make access logs tamper-proof; WORM export is the compliance control.
- It does not replace the audit stream: privileged actions still go to `evidence_audit_events`.
- It does not give tenants a request explorer; that is a separate product decision.
