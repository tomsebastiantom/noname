# The edge worker — what it is, where it runs, what it needs

> **Status:** current · **Date:** 2026-10-31 (America/New_York)
> **Supersedes:** `EDGE-DEPLOYMENT-DECISION.md`, `EDGE-ARCHITECTURE-ANALYSIS.md`, `EDGE-PLATFORM-COMPARISON.md`
> (three documents that answered overlapping questions; consolidated here so there is one place to look).
> **Related:** [`K8S-RUNBOOK.md`](./K8S-RUNBOOK.md) (the parity environment) ·
> [`../2026-10-24/DEPLOYMENT-GUIDE.md`](../2026-10-24/DEPLOYMENT-GUIDE.md) (compose, the daily loop)

---

## 1. The rule

| Environment | Where the edge runs | Where the origin runs |
|---|---|---|
| **Daily development** | `wrangler dev` on your machine | **compose** (podman), same machine |
| **Local parity** | `wrangler dev` on your machine, pointed at k8s | **k8s** (`k3s` in WSL) |
| **Production** | **Cloudflare Workers** (`wrangler deploy`) | **k8s** |

**The edge never runs inside the cluster.** It is a Worker: `wrangler dev` locally, Cloudflare in production.
The cluster is the *origin*.

## 2. What it does (this is why it is not "just auth")

| Responsibility | Code |
|---|---|
| host → tenant resolution (`org.localhost` → orgId), KV-cached, negative-cached | `src/resolve-slug.ts` |
| `/api/*` proxy with HMAC service signing, public-route splitting, `org` stripping | `src/routes/proxy.ts`, `src/hmac.ts`, `src/routes/strip-public-org.ts` |
| WebSocket proxying for collaboration, ticket-gated | `src/routes/proxy-websocket.ts` |
| SSE pass-through (`/api/flags/stream`, `/api/notifications/stream`) | `src/routes/proxy.ts` |
| **bot SSR / SEO**: renders HTML with title/description/OG for crawlers | `src/routes/bot-ssr.ts` |
| SPA assets from R2 (`/_assets/*`, `index.html` fallback) | `src/routes/static.ts`, `src/routes/storefront.ts` |
| token validation with cached JWKS | `src/jwks-cache.ts`, `src/auth.ts` |

Platform surface, i.e. everything Cloudflare-specific: **KV** (slug + JWKS cache: `get`/`put`/`delete`) and
**R2** (two reads). The rest is Hono + Web standards.

## 3. Why it is not in the cluster

1. **The edge's value is proximity.** Workers run in hundreds of locations; the cluster is one machine locally
   or one region in production. Putting the edge inside deletes its only reason to exist.
2. **Different failure domain.** The edge is meant to stay up when the origin degrades — that is why
   `resolve-slug.ts` deliberately does *not* negative-cache a 5xx. Co-locating couples the two.
3. **It costs a runtime.** Self-hosting `workerd` means owning the runtime *and* re-implementing KV/R2, plus
   tracking Cloudflare compatibility dates.
4. **The dev loop was 3–5 minutes per change** there (build → save → import → rollout) versus seconds with
   `wrangler dev`.

It *was* in the cluster for a while (`deploy/edge/`), and it worked — but it needed a `socat` sidecar (because
inside a pod `localhost:8080` is the pod), a `--var API_ORIGIN` override (because `wrangler dev` reads vars from
`wrangler.toml`, not container env), and a seeded R2 bucket (otherwise every page 503s). Three workarounds is
the signal that the placement is wrong. The manifests were deleted.

## 4. Running it locally

### Against compose (the daily loop)

```bash
podman compose up -d                       # origin on localhost:3000 / :8080
pnpm --filter @noname/client dev           # client at localhost:5173
pnpm --filter @noname/workers dev          # edge at localhost:8787
```

No port-forwarding and no extra setup: compose publishes real ports, and `wrangler.toml` already points at
`API_ORIGIN=http://127.0.0.1:3000` / `ZITADEL_ISSUER=http://localhost:8080`. Secrets come from
`packages/workers/.dev.vars`.

### Against the cluster (parity check only)

```bash
node scripts/k8s.mjs up                                    # the origin, in k8s
kubectl -n noname port-forward svc/api 3000:3000           # terminal 1
kubectl -n noname port-forward svc/zitadel 8080:8080       # terminal 2
pnpm --filter @noname/client build                         # so R2 has something to serve
pnpm --filter @noname/workers exec wrangler r2 object put noname-assets/_assets/index.html \
  --file=packages/client/dist/index.html --local
pnpm --filter @noname/workers dev
```

This is deliberately *manual*: it is a check, not a loop. If it ever becomes the daily loop, that is a signal to
reconsider the placement, not to write a wrapper script.

## 5. What R2 needs to exist (the 503 trap)

The worker serves the SPA from R2 — `/_assets/*` and `/` fallback to `_assets/index.html`. Locally that bucket is
emulated and **starts empty**, so the first request 503s until something uploads the build:

```bash
pnpm --filter @noname/client build
# upload dist/* under the _assets/ prefix (source maps unnecessary)
```

In production `wrangler deploy` plus the asset upload does this; nothing else does.

## 6. Platform comparison (why Cloudflare Workers, not Lambda@Edge)

Requirements, taken from §2: WebSockets, SSE, origin sub-requests, per-deployment secrets, TTL cache, object
storage, per-request HTML, no cold-start tax.

| Platform | Verdict |
|---|---|
| **Cloudflare Workers** | meets all eight; the runtime the code targets |
| **AWS Lambda@Edge** | **fails three**: [no environment variables](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html) (only reserved ones — `API_ORIGIN`, `ZITADEL_*`, `WORKER_SERVER_SECRET` would be baked in or fetched per cold start); WebSocket frames are **not** an event source, so ticket-gated collaboration would have to move to the origin; no streaming responses, and viewer-request bodies truncate at 40 KB. Also: us-east-1 only, numbered versions, no container images |
| **CloudFront Functions** | cannot do the job — no network access, so no origin sub-request, no tenant resolution, no SSR |
| **Fastly Compute / Deno Deploy** | credible substitutes, both rewrites, neither adds a capability we need |
| **In-cluster Node BFF** | possible (`@hono/node-server` + Redis + S3); only justified for air-gapped/on-prem targets |
| **Self-hosted `workerd`** | possible ([Helm chart](https://github.com/willswire/union)); means re-implementing KV/R2 — a quarter of work for three KV calls |

## 7. If it must ever run in-cluster (the cheap path)

Not self-hosted workerd. Instead:

1. introduce two ports in `packages/workers` — `CacheStore` (`get`/`put`/`delete`) and `AssetStore` (`get`)
2. two adapter sets: Cloudflare binding (today) and a Kubernetes one (Redis for cache, the cluster S3 for assets)
3. run the Hono app on `@hono/node-server` in the cluster

One seam, two runtimes, ~2–3 days. It also makes the handlers unit-testable without workerd, which they are not
today. **Not built** — it is the answer to a requirement we do not have yet.

## 8. Decision triggers

| If… | Then |
|---|---|
| Cloudflare is acceptable in production | do nothing; this is the end state |
| an air-gapped / on-prem tier is sold | build §7's Node runtime |
| vendor review forbids Cloudflare | Fastly Compute, or §7 |
| realtime collaboration moves to the origin | Lambda@Edge becomes viable (its WS blocker disappears) |
| the edge shrinks to auth + caching only | an ingress/gateway rule is simpler than any function platform |
