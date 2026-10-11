# Origin Auth Verification — 2026-10-10

Verification record for audit remediation item 1: **origin-side access-token verification**, plus the root-cause defects that verification exposed.

## Environment

- Infrastructure: `podman compose` stack up and healthy — Postgres, Dragonfly, ClickHouse, ZITADEL, Keto, Vault, Nango, Jaeger, S3. Not wiped at any point; existing data preserved.
- Application: API `:3000`, edge `:8787`, client `:5173`, all on the host (`tsx watch` + `wrangler dev`).
- ZITADEL app `noname-client`, org `390508237348208650`.
- Requests were issued directly against the API with an edge-equivalent HMAC (standard base64 of `HMAC-SHA256(secret, "<orgId>::")`), and separately **through the edge**.

## Verified checks

### Direct to the API (past the edge HMAC gate)

| # | Check | Result |
|---|---|---|
| 1 | Real login (server-brokered PKCE) | **200**, access token issued |
| 2 | **Real ZITADEL token → `GET /api/auth/:org/session`** | **200** — `roles=admin`, `permissions=19` |
| 3 | **Forged unsigned token carrying the admin project-role claim → same route** | **401** `Authentication required` |
| 4 | Forged token → `POST /api/capabilities/commerce.orders.search` | **401** |
| 5 | **Real token → same capability** | **200** — legitimate authorization path intact |
| 6 | Anonymous, no token | **401** |
| 7 | No HMAC at all | **401** `Request must come through edge worker` — direct-to-origin is blocked |
| 8 | Wrong HMAC | **401** `Invalid auth signature` |

Checks 2 and 5 together are the important pair: the forgery is rejected **and** legitimate identity/authorization still works.

### Through the edge (real request path)

| # | Check | Result |
|---|---|---|
| 9 | Login via the edge | **200** |
| 10 | **Real token → session via the edge** | **200** — `roles=admin`, `permissions=19` |
| 11 | Forged token via the edge | **401** |
| 12 | Slug resolve with the store `Host` | **200**, correct `orgId` returned |

### Static gates

| Gate | Result |
|---|---|
| `pnpm test` | **168 files / 672 tests pass** |
| `pnpm -r typecheck` | clean |
| Biome on every changed file | clean |

Regression coverage added: `verified-token.test.ts` (11 cases) includes the unsigned wildcard-role token, plus audience-matching cases; `resolve-slug.test.ts` (7 cases) covers an unreachable origin, a 5xx, and a definitive 404 miss.

## Root causes found and fixed

Verification is what surfaced these; each was fixed at its cause rather than at the symptom.

**1. Environment shadowing (the reason a valid token was rejected).** `packages/server/src/index.ts` used `import "dotenv/config"`, which loads `.env` from the **cwd**. Running via `pnpm --filter @noname/server dev` sets cwd to `packages/server`, so a duplicated `packages/server/.env` shadowed the repository root `.env`. `pnpm init:zitadel` only rewrites the root file, so its `ZITADEL_CLIENT_ID` had drifted; once origin verification added an audience check, the stale value rejected every legitimate token. Fixed by `packages/server/src/load-env.ts`, which loads the repo root first (so it wins) and then the package-local file for genuinely server-scoped additions; the duplicated `ZITADEL_*` keys were removed from `packages/server/.env` and `.env.example`, with the rule documented in place.

**2. Single-audience check too strict.** A real ZITADEL access token carries several audiences (client id, project id, resource owner). Verifying against exactly one identifier locked everyone out. `verifyAccessToken` now accepts any configured identifier, mirroring oauth2-proxy's `oidc_extra_audiences`. Unit-tested both ways.

**3. Unguarded fetch in the edge slug resolver.** `resolve-slug.ts` awaited `fetchWithTimeout` with no `try`/`catch`; the existing guard only handled non-ok responses. An origin outage threw out of the worker. Now caught, returning `null` **without** negative caching so the next request retries.

**4. Negative caching on any non-ok response.** The resolver miss-cached the slug for any non-ok status, so a brief 5xx negative-cached a valid tenant for the miss window. Only a definitive `404` is cached now; observably, a transient API restart no longer produces ~60s of failed resolution for a real store.

**5. No boundary guard in the edge proxy.** A thrown upstream error could escape the route handler. The handler now catches and returns `502 Upstream unavailable`.

## Known limitation — not application code

`wrangler dev` **terminates the worker process** when the origin socket disappears. Observed four times, with the request never reaching the log and an *empty* fatal error message; wrangler 4.125.0 itself prints "consider checking whether upgrading resolves this error".

This is a workerd/miniflare-level fatal, not an application throw: neither the resolver `try`/`catch` (fix 3) nor a whole-handler `try`/`catch` (fix 5) prevents it. Application-level degradation **is** verified by unit tests; process survival under a dead origin is not achievable from application code in this tooling version.

**Recommendation:** upgrade wrangler (4.125.0 → 4.149.0) and re-run the outage check before relying on origin-outage behaviour in local development. Tracked as a follow-up, not claimed as fixed.

## Not verified

- **Browser flows** (storefront, admin, visual editor). `yogastore.localhost` does not resolve on this host and editing `drivers\etc\hosts` requires administrator rights. The API and edge paths that back those flows — login, tenant resolution, authorization, capability execution — are verified above; DOM-level behaviour is not.
- **Checkout/payment flows** — out of scope for this item.

## Reproduce

```powershell
# health
curl -sf http://localhost:3000/health; curl -sf http://localhost:8787/health

# HMAC for the anonymous identity the edge signs on public routes (standard base64, not base64url)
#   payload = "<orgId>::"   signature = HMAC-SHA256(WORKER_SERVER_SECRET, payload) -> base64

# legitimate path
#   POST /api/auth/yogastore/login  { email, password, codeVerifier, clientId, redirectUri }
#   GET  /api/auth/yogastore/session  with Authorization: Bearer <token>

# forgery must fail
#   same route with a hand-crafted unsigned token carrying the admin project-role claim -> 401

# regression suites
pnpm vitest run packages/server/src/domains/auth/verified-token.test.ts packages/workers/src/resolve-slug.test.ts
```
