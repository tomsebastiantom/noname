# Secrets resolver cache (LLM API keys)

**Status:** Optional in-process TTL cache implemented; **disabled by default** (`SECRETS_LLM_CACHE_TTL_SEC` unset or `0`).

## Current behavior (v1 default)

Every orchestrate job that uses the live Mastra planner calls `resolveLlmApiKey` → Vault HTTP (or env-fallback adapter in dev).

**No cache by default** — intentional:

| Reason | Detail |
|--------|--------|
| Keys stay out of worker env | Resolved at job time, not copied into process environment |
| Rotation | New Vault value visible on next resolve after TTL (or immediately if cache off) |
| Tenant isolation | In-process map keyed by `(orgId, provider)` avoids cross-tenant bugs when implemented carefully |
| Cost | One Vault GET per agent job (~ms on local Vault). LLM latency dominates |

Only orchestrate jobs with the live planner hit this path — not every HTTP request, not mock orchestrate (`MASTRA_ORCHESTRATE_MOCK=true`). Legacy single-step tasks (`generate_layout`, etc.) use ai-pipeline’s resolver with the same once-per-job pattern.

---

## Noti comparison

[Noti’s `GenericCache`](https://github.com/tomsebastiantom/noti/blob/master/pkg/cache/cache.go) wraps [Dgraph Ristretto](https://github.com/dgraph-io/ristretto) — a concurrent in-memory cache with explicit cost/eviction:

```go
ristretto.NewCache(&ristretto.Config{
  NumCounters: numCounters,
  MaxCost:     maxCost,
  BufferItems: bufferItems,
})
```

That is the right **shape** for hot-path secret reads: process-local, TTL-bound, no secrets in Redis.

**Node equivalent in noname:** simple `Map<string, { value, expiresAt }>` inside `domains/secrets/service.ts` — no new dependency. Ristretto-style admission/eviction only matters at very high QPS; agent jobs are low frequency.

| Noti (Go) | noname (Node) |
|-----------|---------------|
| Ristretto in-process | `Map` + TTL |
| `Set` + `Wait()` for consistency | synchronous set after Vault read |
| Shared across goroutines | Single Node process; one map per replica |
| Not distributed | Not in Redis (secrets must not pub/sub) |

Multi-replica: each API/worker process has its own cache. Acceptable for 1–5 minute TTL; rotation propagates within TTL window.

---

## Enabling the cache

```bash
# Seconds; 0 or unset = disabled (default)
SECRETS_LLM_CACHE_TTL_SEC=300
```

Implementation:

- Key: `{orgId}:{requestedProvider|_auto}`
- Invalidate all keys for `orgId` on `putOrgSecret` when `kind === "llm"`
- Cached values: resolved `{ provider, apiKey, source }` or negative cache (`null`)

**Do not enable in prod until ops batch validates Vault live paths** — same gate as other I-a work.

---

## When *not* to cache

- Debugging key rotation (leave TTL at 0)
- Comms credentials (`resolveCommsCredentials`) — not cached yet; lower call frequency
- Platform bootstrap secrets read once at startup

---

## Future hardening

| Improvement | When |
|-------------|------|
| Short-lived stream tickets for SSE | Separate from secrets; see [IN-APP-INBOX-SSE.md](./IN-APP-INBOX-SSE.md) |
| LRU max entries cap | If many orgs on one worker |
| OTel counter `secrets.cache_hit` | When enabling TTL in prod |
| Redis for secrets | **Never** — only in-process |

---

## Related

- `packages/server/src/domains/secrets/service.ts` — `resolveLlmApiKey`, cache helpers
- `packages/server/src/domains/agent/mastra/resolve-planner-model.ts` — consumer
- [INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) — Phase I-a
