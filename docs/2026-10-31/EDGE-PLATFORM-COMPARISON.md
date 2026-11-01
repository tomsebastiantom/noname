# Edge platform comparison — is the worker on the right platform, and does it belong in the cluster?

> **Status:** analysis for decision · **Date:** 2026-10-31 (America/New_York)
> **Question:** is Cloudflare Workers the right home for the edge? Would Lambda@Edge or similar be better? And
> does the edge need to live inside the Kubernetes cluster at all?
> **Related:** [`EDGE-ARCHITECTURE-ANALYSIS.md`](./EDGE-ARCHITECTURE-ANALYSIS.md) (what to change in the code) ·
> [`EDGE-DEPLOYMENT-DECISION.md`](./EDGE-DEPLOYMENT-DECISION.md) (where it runs today)

---

## 1. What the edge must be able to do (derived from the code, not from preference)

| Requirement | Where it comes from in this repo |
|---|---|
| **Long-lived WebSocket proxying** with ticket gating | `src/routes/proxy-websocket.ts` — collaboration sessions |
| **SSE streaming pass-through** | `/api/flags/stream`, `/api/notifications/stream`, `stream_ticket` |
| **Sub-requests to the origin** with HMAC headers | `hmac.ts`, `resolve-slug.ts`, `storefront.ts` |
| **Per-deployment configuration** (origin, issuer, client id, service secret) | `Env` in `types.ts` |
| **A key/value cache with TTL** | KV: slug cache, JWKS cache |
| **Read-only object storage for the SPA** | R2: `/_assets/*` + `index.html` |
| **HTML generation per request** (bot SSR) | `bot-ssr.ts` |
| **No cold-start tax on first byte** | storefront requests are user-facing |

Any candidate must satisfy **all** of these. That is the whole analysis: the requirements are unusually broad
because the edge here is not just a header rewriter.

## 2. Candidates

| Platform | WebSockets | SSE / streaming responses | Sub-requests to origin | Per-deploy config | KV-style cache | Object store | Verdict |
|---|---|---|---|---|---|---|---|
| **Cloudflare Workers** (today) | ✅ native | ✅ streaming | ✅ `fetch` | ✅ vars + secrets | ✅ KV | ✅ R2 | **meets every requirement** |
| **AWS Lambda@Edge** | ❌ not invoked for WebSocket frames | ⚠️ no streaming responses; generated responses are body-buffered | ✅ | ❌ **no environment variables** — only reserved ones | ⚠️ via DynamoDB/S3 calls | ⚠️ S3 calls | **fails 3 of 8 requirements** |
| **CloudFront Functions** | ❌ | ❌ | ❌ no network access | ❌ | ❌ | ❌ | **cannot do this job at all** |
| **Fastly Compute (Wasm)** | ✅ | ✅ | ✅ | ✅ | ✅ KV store | ✅ Object store | viable alternative, full rewrite to Rust/JS-on-Wasm |
| **Deno Deploy** | ✅ | ✅ | ✅ | ✅ env | ✅ KV | ⚠️ via S3 | viable, smaller ecosystem |
| **In-cluster Node service (BFF)** | ✅ | ✅ | ✅ | ✅ | ✅ Redis | ✅ S3 | **no global distribution** — see §4 |
| **Self-hosted workerd in k8s** | ✅ | ✅ | ✅ | ✅ | ❌ must build a KV binding | ❌ must build an R2 binding | possible, expensive |

### The Lambda@Edge facts that decide it

From AWS's own restrictions page ([docs](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html)):

- **No environment variables** (except reserved ones). Our worker's `API_ORIGIN`, `ZITADEL_ISSUER`,
  `ZITADEL_CLIENT_ID` and `WORKER_SERVER_SECRET` would have to be baked into the bundle or fetched from SSM on
  every cold start — for a secret, that is a meaningful regression.
- **Functions must live in `us-east-1`**, must be a numbered version, and cannot use container images or arm64.
- **No VPC access**, no layers, no provisioned concurrency.
- **Body truncation**: 40 KB for viewer requests, 1 MB for origin requests — a real constraint for the admin
  API paths this edge proxies.
- **Viewer-response functions cannot change the HTTP status code.**
- WebSocket frames are **not** an event source for Lambda@Edge; CloudFront proxies WebSockets without invoking
  the function, so ticket-gated collaboration would have to move to the origin (ALB) — a design change, not a
  port.

CloudFront Functions are further out: no network access at all, so no origin sub-request means no tenant
resolution and no SSR.

**Conclusion: Lambda@Edge is not a drop-in.** Choosing it would mean redesigning the realtime path and losing
per-deployment secrets. That is the opposite of "similar option".

## 3. Is Cloudflare Workers the right *kind* of platform?

Yes, for this workload: the three properties that matter are **websockets + streaming + origin sub-requests
with secrets**, and Workers is the platform with the least friction on all three. Fastly Compute and Deno
Deploy are credible substitutes — both would be rewrites, and neither adds a capability this code needs.

The honest counterweight is **lock-in**: KV and R2 are Cloudflare products. That is precisely what the ports
seam in `EDGE-ARCHITECTURE-ANALYSIS.md` §7 addresses — and it is also why keeping the seam is worth the two
or three days even if we never leave Cloudflare.

## 4. Does the edge belong inside the Kubernetes cluster?

**No, not in production.** Three reasons, in order of weight:

1. **The edge's value is proximity.** A Worker runs in hundreds of locations; the cluster runs on one machine
   (locally) or one region (in production). Moving the edge into the cluster deletes the only reason it exists
   and adds a network hop for every request.
2. **Its failure mode is different.** The edge is supposed to be the thing that stays up when the origin is
   degraded (that is why `resolve-slug.ts` deliberately does not negative-cache a 5xx). Co-locating them
   couples those failure domains.
3. **Operationally it is a new runtime to own.** Self-hosted workerd means owning a runtime *plus* two binding
   implementations, and tracking Cloudflare compatibility dates yourself.

Where in-cluster *does* make sense: **local development** (one `kubectl apply` for the whole stack — what we
have, clearly labelled dev-only) and **air-gapped/on-prem installs**, where there is no Cloudflare to use. That
is the case for the Node BFF, not for self-hosted workerd.

## 5. Recommendation

| Deployment target | Edge runs on | Why |
|---|---|---|
| **Public SaaS (default)** | **Cloudflare Workers** (today) | only platform meeting all eight requirements with no redesign; adds global distribution for free |
| **On-prem / air-gapped** | in-cluster Node BFF (`@hono/node-server` + Redis + S3) | no Cloudflare available; the ports seam makes the same handlers runnable there |
| **Local development** | `wrangler dev` in a pod (today) | dev-only convenience; not a production runtime |
| AWS-native org, CloudFront mandated | CloudFront + Lambda@Edge **plus** WS/SSE bypassing to the origin | possible, but it is a redesign of the realtime path and a config regression — budget it as one |

**Net: the current choice is right.** Keep Cloudflare Workers for production, keep the local container clearly
labelled, and implement the ports seam so the handlers are testable without workerd and portable to the Node
runtime if an air-gapped target ever appears.

## 6. What would change this decision

| Trigger | New answer |
|---|---|
| SOC2/vendor review forbids Cloudflare | Fastly Compute or in-cluster Node BFF |
| an on-prem/air-gapped tier is sold | build the Node BFF (seam already planned) |
| realtime collaboration moves to the origin (ALB) | Lambda@Edge becomes viable; the WS blocker disappears |
| edge traffic becomes cache-only (no SSR, no tenancy) | a plain CDN + ingress rules is simpler than any function platform |

## 7. Sources

- AWS, *Restrictions on Lambda@Edge* — [docs.aws.amazon.com](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-at-edge-function-restrictions.html)
- AWS, *Restrictions on edge functions* (CloudFront Functions vs Lambda@Edge) — [docs.aws.amazon.com](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/edge-functions-restrictions.html)
- *Edge Functions Explained: Workers, Lambda@Edge, Vercel Edge, Deno Deploy* — [speedtesthq.com](https://www.speedtesthq.com/guides/cdn/edge-functions-explained)
- *Edge + serverless hybrid: Cloudflare Workers × Kubernetes* — [developer.aliyun.com](https://developer.aliyun.com/article/1740902)
- *Edge rendering architecture: when to move SSR to the edge* — [eltherion.com](https://eltherion.com/blog/edge-rendering-architecture-when-to-move-ssr-to-edge)
- workerd self-hosting, Helm chart — [github.com/willswire/union](https://github.com/willswire/union)
