# Edge architecture — analysis and recommendation

> **Status:** analysis for decision · **Date:** 2026-10-31 (America/New_York)
> **Question:** the platform now runs in Kubernetes. What is the right, k8s-friendly shape for the edge
> worker — and is what we have after the move correct?
> **Related:** [`EDGE-DEPLOYMENT-DECISION.md`](./EDGE-DEPLOYMENT-DECISION.md) (where it runs today) ·
> [`K8S-RUNBOOK.md`](./K8S-RUNBOOK.md) · [`RFC-EVAL-SERVICE.md`](../2026-10-24/RFC-EVAL-SERVICE.md)

---

## 1. What the edge does today (inventory, with evidence)

`packages/workers` is a Hono app deployed as a Cloudflare Worker. Its responsibilities:

| Responsibility | Code | Platform dependency |
|---|---|---|
| `/health` | `src/index.ts` | none |
| `/api/*` — authenticated proxy to the origin, HMAC-signed service calls | `src/routes/proxy.ts`, `src/hmac.ts` | `fetch`, crypto |
| token validation (JWKS, cached) | `src/jwks-cache.ts` | **KV** (`delete` on invalidation) |
| host → tenant resolution | `src/resolve-slug.ts` | **KV** (`get`/`put`) + origin `GET /api/tenants/resolve/:slug` |
| SPA assets `/_assets/*` | `src/routes/static.ts:9` | **R2** (`env.R2.get`) |
| bot SSR + SPA fallback for `/` | `src/routes/storefront.ts:60` | **R2** (`_assets/index.html`) + origin `GET /api/edge/schema/...` |

So the *real* platform surface is: **KV (3 operations), R2 (2 reads), HMAC, fetch.** Everything else is plain
Hono/Web-standard code.

> **Correction to an earlier note in `EDGE-DEPLOYMENT-DECISION.md`:** that document said R2 was "declared but
> unused". That was wrong — the grep behind it did not recurse into `src/routes/`. R2 is used in two places,
> and it is the reason the edge returns **503** in the local cluster: the emulated bucket is empty, so the SPA
> fallback has nothing to serve. In production the deploy pipeline uploads the client build to R2, which is why
> this never appears on Cloudflare.

## 2. What actually broke after the move — and what did not

| Symptom | Real cause | Is it a k8s problem? |
|---|---|---|
| `/` returns 503 | R2 bucket empty: the client build is never uploaded locally | **No** — it is a *deployment-pipeline* gap. `wrangler deploy` uploads assets for you; nothing did it in the cluster. |
| `API_ORIGIN` pointing at `127.0.0.1` | `wrangler dev` reads vars from `wrangler.toml`, not container env | **No** — a property of the dev server, not of k8s |
| token validation failing | `ZITADEL_ISSUER=http://localhost:8080` inside a pod | **No** — the same loopback problem the API and seed Job have |
| needs a `socat` sidecar | consequence of the above | incidental |

**Conclusion: the edge was not broken by Kubernetes.** Every failure was either a missing artifact or the dev
server's config semantics. That matters, because it tells us where not to spend effort.

## 3. The forces that decide this

| Force | Why it matters here |
|---|---|
| **Fidelity to production** | the edge's job is latency + bot SSR + token checks at the edge. Running a *different* runtime locally means the thing you test is not the thing you ship |
| **Operational cost** | whoever owns the cluster must own the edge runtime too, if it lives there |
| **Vendor lock** | KV/R2 are Cloudflare products; every self-hosted option must replace them |
| **Dev/prod parity** | one codebase, two runtimes is manageable **only** with a narrow, explicit seam |
| **Failure isolation** | an edge outage should degrade to origin, not to a blank page |
| **Do the bindings even matter at this scale?** | three KV calls and two R2 reads — this is a *cache*, not state of record |

## 4. Options

### O1 — Edge on Cloudflare, origin in k8s (current production intent)
`wrangler deploy` for the worker; Kubernetes runs API, Postgres, Dragonfly, ClickHouse, Zitadel, browser farm.
Local: `wrangler dev` (host, or the dev-only container we have).
**Cost:** near zero. **Fidelity:** perfect. **Lock-in:** total for the edge layer. **Ops:** none beyond deploy.
This is the mainstream hybrid: edge compute + k8s origin (see the widely-cited hybrid pattern, and Cloudflare's
own model where Workers are the edge and "origin" is anything).([1](https://developer.aliyun.com/article/1740902), [2](https://eltherion.com/blog/edge-rendering-architecture-when-to-move-ssr-to-edge))

### O2 — Self-host `workerd` in the cluster
Run workerd with a capnp config; implement KV and R2 bindings (Redis for KV, the cluster S3 for R2). A Helm
chart exists for workerd ([willswire/union](https://github.com/willswire/union)).
**Cost:** weeks, ongoing. **Fidelity:** good for handlers, but you now track Cloudflare's runtime releases
yourself. **Lock-in:** none. **Ops:** you own a runtime plus two binding shims, and a compat matrix.
This is the option that *looks* most "k8s-native" and is the worst value at this size.

### O3 — Portable edge core with ports + adapters (hexagonal)
Extract the handler logic into a runtime-agnostic package with two explicit ports:

```ts
interface CacheStore { get<T>(k: string): Promise<T | null>; put(k: string, v: unknown, ttl: number): Promise<void>; delete(k: string): Promise<void>; }
interface AssetStore { get(key: string): Promise<{ body: ReadableStream } | null>; }
```

Two adapters each: **Cloudflare** (`KVNamespace`, `R2Bucket`) and **k8s** (Redis/ioredis, S3). The same Hono
app then runs on **workerd** (Cloudflare) and on **Node** via `@hono/node-server` (cluster).
**Cost:** ~2–3 days for the seam and the CF adapters (behaviour-preserving), ~1 day more for the k8s adapters.
**Fidelity:** one code path, both runtimes. **Lock-in:** the seam, not the app. **Ops:** optional — you can still
ship only to Cloudflare and keep the k8s runtime for tests/air-gapped installs.

### O4 — Dissolve the edge into the origin/gateway
Move auth and SSR to the origin, keep only CDN caching at the edge (or use an Envoy Gateway / Traefik
middleware for the auth part).
**Cost:** product-visible change (latency, bot behaviour). **Fidelity:** n/a. **Ops:** simplest fleet, but it
gives up the reason the edge exists.

## 5. Scoring

| | Fidelity | Ops cost | Lock-in | Effort | Fits k8s today |
|---|---|---|---|---|---|
| O1 Cloudflare edge | 5 | 5 | 1 | 5 | yes (edge stays outside) |
| O2 workerd self-host | 3 | 1 | 5 | 1 | yes, expensively |
| **O3 portable core** | **5** | **4** | **4** | **3** | **yes** |
| O4 dissolve | 2 | 5 | 5 | 2 | yes, but changes the product |

## 6. Recommendation

**Target: O3. Deployment: O1.**

That is not a compromise — it separates *where the code runs* from *how it is written*:

- **Write** the edge against two narrow ports (cache, assets). That is the only Cloudflare-specific surface, and
  making it explicit is good design regardless of hosting.
- **Deploy** to Cloudflare Workers in production (O1): it is the runtime the code targets, and it hands you the
  asset pipeline, KV/R2, and global distribution for free.
- **Keep the k8s runtime** as the second adapter: it makes the handlers unit-testable without workerd, and it
  keeps an air-gapped/on-prem deployment possible without a rewrite.

For the local cluster **now**: keep the edge as a dev-only convenience (it already is, and it is labelled as
such). Do not invest further in making `wrangler dev` behave like a production service — that is O2's cost
without O2's benefit.

### Why not O2
Three KV operations and two object reads do not justify owning a runtime and two binding implementations. The
Helm chart exists and works; the *operational* question ("who upgrades workerd, and how do we know a Cloudflare
compatibility date did not change semantics?") does not go away.

### Why not O4
The edge is where bot SSR and token checks are cheap. Moving them to the origin removes the reason it exists.

## 7. What O3 changes in this repository

1. `packages/edge-core` (new): the Hono app + `CacheStore`/`AssetStore` ports; handlers moved from
   `packages/workers/src/routes/*` with no behaviour change.
2. `packages/workers`: becomes a thin Cloudflare entrypoint — adapters `KVNamespace → CacheStore`,
   `R2Bucket → AssetStore`, plus `wrangler.toml`. Deployed exactly as today.
3. `packages/edge-node` (optional, later): Node entrypoint + ioredis/S3 adapters + a container. This is what would
   run in the cluster if the edge must live there.
4. Tests move to the core and run against in-memory adapters — no workerd needed, which also makes the edge
   testable in CI for the first time.

## 8. Decision triggers

| If… | Then |
|---|---|
| Cloudflare is acceptable in production | stop at O1 + O3's seam; never build `edge-node` |
| an air-gapped or on-prem install is required | build `packages/edge-node` (O3's k8s adapter) |
| Cloudflare is disallowed entirely | O2, budgeted as a quarter, not a sprint |
| the edge's responsibilities shrink to auth only | reconsider O4 (Envoy `ext_authz` + origin SSR) |

## 9. One-line answer

The edge is not broken and k8s did not break it — it needs an **asset pipeline** and a **config seam**, not a
new runtime. Write it against two ports (O3), ship it to Cloudflare (O1), and only build the in-cluster runtime
if a deployment target actually requires it.
