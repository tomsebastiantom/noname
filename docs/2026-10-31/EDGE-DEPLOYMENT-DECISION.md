# Where the edge worker runs

> **Status:** decision recorded · **Date:** 2026-10-31 (America/New_York)
> **Question:** we moved everything into Kubernetes — does the edge belong there, or does it mean the
> platform cannot be deployed to Cloudflare at all?
> **Related:** [`K8S-RUNBOOK.md`](./K8S-RUNBOOK.md) (how the local stack runs) ·
> [`RFC-EVAL-SERVICE.md`](../2026-10-24/RFC-EVAL-SERVICE.md) (browser tier that talks to this edge).

---

## 1. What the edge actually is

`packages/workers` is a **Cloudflare Worker**: a Hono app (`new Hono<{ Bindings: Env }>()`,
`export default app`) targeting **workerd**, deployed with `wrangler deploy`.

Its Cloudflare-specific surface is **three KV operations**:

| Call | Where | Purpose |
|---|---|---|
| `env.KV.get(key, "json")` | `src/cache.ts:25` | slug → orgId cache |
| `env.KV.put(key, value, { expirationTtl })` | `src/cache.ts:41` | populate that cache |
| `env.KV.delete(key)` | `src/jwks-cache.ts:88` | invalidate a cached JWKS |

`R2` is **used**, in two places: `src/routes/static.ts` (serves `/_assets/*`) and `src/routes/storefront.ts`
(serves `_assets/index.html` as the SPA fallback). An earlier version of this document claimed it was unused;
that was wrong — the grep behind it did not recurse into `src/routes/`. Full inventory and the corrected
architecture analysis: [`EDGE-ARCHITECTURE-ANALYSIS.md`](./EDGE-ARCHITECTURE-ANALYSIS.md).

That also explains the 503 in the local cluster: the emulated bucket is empty because nothing uploads the client
build outside `wrangler deploy`. It is a pipeline gap, not a Kubernetes one.

## 2. The three ways to host it

| Option | How it works | Verdict |
|---|---|---|
| **A. Cloudflare Workers (production)** | `wrangler deploy` publishes it to Cloudflare's edge; KV and R2 are the real services. Kubernetes keeps running the origin (API, Postgres, Clickhouse, Zitadel, browser farm) and the Worker proxies `/api` to it. | **Recommended.** This is the architecture the code was written for, and it is the standard shape: edge on Cloudflare, origin in k8s. Nothing about running the origin in k8s argues against it. |
| **B. Self-hosted `workerd` in k8s** | `workerd serve` with a hand-written capnp config; every binding must be provided. A Helm chart exists (`github.com/willswire/union`). | **Not recommended as-is.** It means re-implementing KV (and the rest of the bindings) — a project, not a Dockerfile. Worth it only if "no Cloudflare dependency" is a hard requirement. |
| **C. `wrangler dev` in a container (what the local cluster does)** | The same workerd runtime, KV/R2 emulated in-process, no Cloudflare account. | **Correct for local only.** It is what makes the local stack one `kubectl apply`. It is **not** a production runtime: `wrangler dev` is a dev server, it takes its variables from `wrangler.toml` rather than the container environment (hence `--var API_ORIGIN:…` in the manifest), and it is single-process with no restart semantics worth trusting. |

**So: option C locally, option A in production, option B only if the Cloudflare dependency must be removed.**
The local container is a convenience for a one-command stack, and both `deploy/edge/Containerfile` and the
Deployment say so in their headers.

## 3. "Can the whole thing be deployed to Cloudflare?"

No — and it is worth being concrete about why, because the answer differs per component:

| Component | On Cloudflare? | Why |
|---|---|---|
| **edge worker** | **yes** | it already is a Worker |
| static client bundle | **yes** (Pages/Workers assets) | it is a static SPA |
| API (Hono server) | **partly** | Hono runs on Workers, but this API is a long-lived Node service with Postgres, BullMQ on Redis, ClickHouse, Vault, S3 and OTel. Workers have no BullMQ, no long-lived sockets, and CPU-time limits per request. |
| Postgres | **no** (Hyperdrive proxies *to* one) | you still need a Postgres somewhere |
| Redis / BullMQ (Dragonfly) | **no** | Cloudflare has Queues and Durable Objects, not Redis |
| ClickHouse | **no** | analytics sink; needs a real server |
| Zitadel, Keto, Nango, Vault | **no** | full services with their own databases |
| Playwright browser farm | **no** | Cloudflare has Browser Rendering, but it is not this containerised Chromium fleet |

Conclusion: **the edge and the static client are Cloudflare-native; the platform around them is a
Kubernetes workload.** That split is not a compromise forced by the migration — it is the shape the system
already had.

## 4. If the edge must run inside Kubernetes in production

Then do it the cheap way, not the expensive one. The blocker is only `env.KV`, and the cluster **already
runs Redis (Dragonfly)**:

1. introduce a `KV` interface in `packages/workers` — `get(key)`, `put(key, value, { ttl })`, `delete(key)`
2. two adapters: the Cloudflare binding (today's behaviour) and a Redis adapter (~50 lines, `ioredis` is
   already a dependency in `packages/server`)
3. run the Hono app on Node via `@hono/node-server` in the cluster, keeping workerd on Cloudflare

That keeps one codebase on two runtimes with a single seam, instead of self-hosting workerd and
re-implementing its bindings. It is also the only version of "edge in k8s" whose operating cost is a day
rather than a quarter.

**Not yet done.** The current state is option C, which is honest for local use and clearly labelled.

## 5. What this means today

- `node scripts/k8s.mjs status` reports the edge as **up** (`/health` 200) because locally it genuinely is.
- The edge's **server-side render returns 503 for tenant hosts** — an application path (tenant resolution /
  render), not the hosting question discussed here. The SPA served by `client` works regardless.
- The production answer is unchanged by any of this: **`wrangler deploy` for the worker, k8s for the origin.**
