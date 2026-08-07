# Scalability

> Whether the system can run on more than one instance, handle more data, and handle more load. See [`README.md`](./README.md) for scope/method.

---

## Single-instance state that breaks horizontal scaling (HIGH)

These are the most important findings in this entire audit — they are the difference between "can run 2 replicas behind a load balancer" and "cannot."

### Collaborative editing rooms are in-process only

```21:22:packages/server/src/domains/collab/index.ts
/** In-process Yjs rooms. Multi-API scaling needs Redis/Hocuspocus-style sync (deferred). */
export function createCollabDomain(deps: CollabDomainDeps) {
```

```101:packages/server/src/domains/collab/layout-room.ts
const rooms = new Map<string, Room>();
```

```120:packages/server/src/domains/collab/richtext-yjs-room.ts
const rooms = new Map<string, YjsRoom>();
```

Two WebSocket clients editing the same document will only stay in sync if they connect to the **same server process**. Behind a load balancer with round-robin or multiple replicas, this breaks silently (no error — just two divergent documents) unless the LB is configured with sticky sessions scoped per document, which nothing in the code enforces.

### SSE client registry is in-process

```16:packages/server/src/shared/sse-manager.ts
const clients = new Map<OrgId, Map<StreamId, ClientEntry>>();
```

Redis pub/sub does forward broadcast messages between instances (lines 44–56), so the *fan-out* works, but a client's actual SSE connection is pinned to whichever node accepted it. This implies an undocumented sticky-session requirement at the LB layer.

### Other process-local `Map`s that will diverge across replicas

| Location | State | Impact |
|---|---|---|
| `domains/machines/engine.ts:18` | `guards = new Map<string, Guard>()` — global, not per-org | Guard registration must happen identically on every replica at boot; any per-replica registration order difference is a silent bug source |
| `domains/secrets/service.ts:27` | `llmKeyCache = new Map` | Each replica caches independently; a key rotation can be "fixed" on one replica and stale on another until TTL expires (default TTL is 0 = disabled, so low risk today, but the mechanism doesn't generalize) |
| `shared/bullmq-queue.ts:4` | `queues = new Map` — singleton queue registry | Fine as a local registry of Redis-backed queues, but worth confirming no in-memory-only fallback exists |
| `domains/tenant/adapters/bundler.ts:85` | `pendingBuilds = new Map` — dedup cache | Two replicas can both start a duplicate tenant bundle build simultaneously |

### Event bus silently degrades to single-instance mode without Redis

```42:44:packages/server/src/shared/event-bus.ts
} catch {
  publisher = null;  // falls back to in-process only
}
```

If the Redis connection fails at startup, the event bus doesn't error — it just stops delivering events across instances. In a multi-replica deployment this is a "everything looks fine, but domain B never learns about domain A's events" failure mode, which is worse than a crash because it's undetectable without dedicated alerting on this fallback path.

---

## Query / data-layer scalability

### Unpaginated list endpoints

Several list endpoints load the entire result set with no `LIMIT`/`OFFSET`, and are directly exposed over HTTP:

```154:167:packages/server/src/domains/documents/adapters/postgres.ts
async listDocuments(orgId, filters = {}) {
  const rows = await db.select().from(documents).where(and(...conditions));
  return rows.map(mapDocument);
}
```

exposed via:

```45:47:packages/server/src/domains/documents/routes/content.ts
routes.get("/:type", async (c) => {
  return ok(c, await content.findByType(orgId, c.req.param("type")));
```

Also unpaginated: `findContentTypes` (`postgres.ts:33-35`), `assets.list`, `machines.listInstances` (`postgres.ts:77-82`), `listDefinitions` (`L39-44`), `listTransitions` (`L97-102`).

A pagination helper already exists (`shared/pagination.ts:15`, `parseLimitOffset`) but is only wired into 3 files — all in `analytics/routes/`. Every content-type/document/machine list endpoint will degrade linearly with tenant data volume, and eventually with the number of tenants sharing a table.

### N+1 / sequential-await patterns

- **Flags evaluation writes one row per flag per request:**
  ```89:95:packages/server/src/domains/flags/service.ts
  const results = await Promise.all(
    toEvaluate.map(async (flag) => {
      const result = evaluateFlag(flag, ctx);
      await recordEvaluation(storage, flag, ctx, result);
  ```
  This is on the hot evaluation path (flag checks happen per-request, potentially per-page-load). One DB round-trip per flag per evaluation call does not scale with flag count.

- **Batch flag evaluation re-does the full evaluate+record cycle per context** (`flags/service.ts:100-108`) — no batching of the underlying writes.

- **Team member listing makes one Zitadel API call per user:**
  ```251:261:packages/server/src/domains/auth/service.ts
  return Promise.all(
    users.filter(...).map(async (user) => ({
      mfaEnrolled: await userHasTotpFactor(orgId, user.userId),
    })),
  );
  ```
  A team page with 100 users makes 100 sequential-ish external API calls to Zitadel just to render an MFA column.

- **Scope/permission revocation loops sequentially over Keto tuples:**
  ```14:16:packages/server/src/domains/auth/scope/service.ts
  for (const tuple of tuples) {
    await tupleWriter.revoke(tuple);
  }
  ```
  Removing a user from a large team is O(tuples) sequential HTTP calls to Keto.

### Missing indexes visible from the schema

- `machine_instances` has no index on `orgId` despite `listInstances` filtering by org only (`domains/machines/schema.ts:45-53`).
- `machine_transitions` has no index on `instanceId` despite `listTransitions` filtering by it.
- JSONB slug/search lookups (`documents.data->>'slug'`, `documents.meta->>'searchText' ILIKE ...`) have no supporting functional/GIN index — these become full scans as the `documents` table grows. There is a `documents_tenant_type` composite index, but nothing on the JSON paths actually queried.
- `findDocumentsWithDataMentioning` casts the entire JSONB column to text (`documents.data::text LIKE ...`) — this cannot use any index at all, by construction, regardless of what gets added.

### Connection pool is a fixed, small, unconfigured constant

```15:16:packages/server/src/drizzle.ts
const client = postgres(connectionString, { max: 10 });
```

Fixed pool of 10 connections shared by the entire API process **and** the 6 co-located BullMQ workers (agent, analytics, notifications, webhooks ×2, tenant — see below). No `idle_timeout`/`connect_timeout`, and no env-driven sizing for larger deployments.

### Background workers are co-located with the API process

Every domain that needs background work starts its BullMQ worker inline in the same process as the HTTP server: `agent/index.ts:56`, `analytics/index.ts:17`, `notifications/index.ts:42`, `webhooks/index.ts:52-53` (2 workers), `tenant/index.ts:17`. This means:
- HTTP throughput and background job throughput cannot be scaled independently.
- Every HTTP replica also runs a full copy of every worker, competing for the same 10-connection DB pool and the same CPU.
- A traffic spike that justifies scaling HTTP replicas also multiplies job-processing concurrency, which may not be desired (e.g. rate-limited third-party APIs called from webhook/notification workers).

---

## Client-side scalability (data volume, not request volume)

- **No list virtualization anywhere in the client** (`react-window`/`react-virtuoso` — 0 matches). The layer tree panel (`LayerTreePanel.tsx`, 430 lines) recursively renders every node with no windowing; admin tables (traces, analytics, users) render full result sets. This will visibly degrade as tenants accumulate content, and directly compounds the server-side "unpaginated list" issue above — even if the server paginated, several of these UI lists aren't wired to request pages at all.
- **Zero `React.memo` usage in the entire client package** (0 matches for `React.memo`/`memo(`). Combined with wide-dependency context values (see [`EFFICIENCY-PERFORMANCE.md`](./EFFICIENCY-PERFORMANCE.md)), this means UI responsiveness will degrade non-linearly as documents/layouts grow, independent of network/data scale.

---

## What scales fine today (no action needed)

- Redis-backed BullMQ queues themselves scale horizontally correctly — the problem is process co-location, not the queue technology.
- The event bus's Redis pub/sub path works correctly for cross-instance delivery when Redis is up; the risk is purely the silent-fallback failure mode above.
- `@noname/shared`'s pure helpers (slug parsing) have no scalability concerns — they're pure functions with no state.
