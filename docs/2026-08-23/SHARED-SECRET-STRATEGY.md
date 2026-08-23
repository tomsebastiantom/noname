# Shared Edge↔Server Secret — Research & Recommended Approach

> **Status:** Proposal — not yet implemented (2026-08-23). Fix later per plan below.
> **Scope of problem:** `WORKER_SERVER_SECRET` must match between `packages/workers` (signer) and `packages/server` (verifier).
> **Related:** [`EDGE-STOREFRONT-FIXES.md`](./EDGE-STOREFRONT-FIXES.md)

---

## The problem

- Edge signs every proxied request with `WORKER_SERVER_SECRET`; server verifies the HMAC before anything runs.
- Today it is set independently in **two files**: `packages/workers/.dev.vars` and `packages/server/.env`.
- Nothing compares them. If one side rotates alone:
  - Server returns `401 "Invalid auth signature"` / `"Request must come through edge worker"` for **everything**.
  - Slug→org resolution inside the worker fails → downstream `400 "org id required"` on catalog/schema/analytics/stream — exactly today's incident shape, with no hint pointing at the secret.
- Production is a different world: each platform has its own store (Node process env vs `wrangler secret put`). Drift there is a deploy-pipeline concern, not a file concern.

## Hard constraint

Wrangler reads `.dev.vars` **only from the worker package directory** — there is no include mechanism or alternate path flag. So "one literal file consumed by both processes" cannot be done purely by config for the edge side.

---

## How open-source projects handle cross-service secrets

| Project | Approach | Notes |
|---------|----------|-------|
| **Supabase** (self-hosted) | One canonical root `.env`, every service reads it via compose `env_file` | Single source of truth; works because all services can point at arbitrary paths |
| **Flagsmith** (self-hosted) | One `.env` referenced by all containers (`env_file:` in compose) | Same idea |
| **PostHog** (dev) | Single `.env` consumed by Django + plugin server + Kafka stack | |
| **Turborepo** monorepos | Root/global dotfiles + `strictEnvs`; per-app files generated or passed through | Turbo explicitly warns about duplicated env across apps being a drift source |
| **Cloudflare full-stack templates** | Generate `.dev.vars` per worker from a script/source during setup (`init` scripts) | Because wrangler forces per-package files, templates *generate* them rather than hand-maintain |
| **Node-only stacks** | `dotenv-cli -e ../../.env -- pnpm dev` to inject one file into many processes | Works until one toolchain demands its own file (wrangler does) |

**Pattern consensus:** keep ONE canonical source; make per-tool/per-package files *derived artifacts* generated/synced from it; verify equality automatically. Hand-editing N copies is what causes the drift.

---

## Options evaluated

### A. Literal common env file loaded by both
Root `.env`, loaded via `dotenv-cli` into the server, …but wrangler still refuses anything but its own `.dev.vars`. ❌ Doesn't actually achieve single-file for the edge; would need generation anyway.

### B. Canonical shared file + sync script (recommended)
- New gitignored `/env/.env.shared` (+ committed `.example`) holds `WORKER_SERVER_SECRET` (and future cross-service secrets).
- `pnpm secrets:sync` — writes/updates BOTH `packages/server/.env` entry and `packages/workers/.dev.vars` from the canonical file; generates a fresh crypto-random secret if none exists.
- `pnpm secrets:check` — exits non-zero with an actionable message on missing/mismatched values.
- Wire `secrets:check` into the workers `dev` script (`"dev": "pnpm -w secrets:check && wrangler dev"`) so starting the edge fails fast instead of producing mystery 400s later. Optionally also run in CI.
- ✅ True single source; ✅ matches Cloudflare template practice; ⚠️ adds one small script (~80 lines, no deps beyond node:crypto).

### C. Keep two hand-edited files + preflight check only
Same `secrets:check` gate, no canonical file. ✅ Smallest diff; ⚠️ still invites manual drift, just detects it. Reasonable stepping stone if B feels heavy.

### D. Boot fingerprint logging (do regardless of A–C)
Both sides print `sha256(secret)` first 8 hex chars at startup:
- Server: once in bootstrap (`[auth] WORKER_SERVER_SECRET fingerprint sha256:ab12cd34`).
- Worker: module-scope log (prints on isolate boot / wrangler reload) with same format.
Visual comparison in logs pinpoints mismatch instantly without leaking the secret. ~5 lines total.

### E. Eliminate the shared secret architecturally
Cloudflare **Service Bindings** (`env.API.fetch(request, apiOrigin)`) remove network hops AND request signing entirely when origin is also a Worker. Our origin is a Node server, so this doesn't apply locally today — but if the origin ever moves onto Workers, the whole HMAC layer becomes unnecessary. Worth remembering; not actionable now.

---

## Recommended plan (when we fix it)

1. Implement **B** (canonical `env/.env.shared` + `secrets:sync` / `secrets:check` scripts using `node:crypto` only).
2. Add **D** fingerprint logs on both sides (cheap, helps even outside drift scenarios).
3. Gate workers `dev` on `secrets:check`; add same check to CI test job.
4. Small companion hardening in `resolveSiteId`: `console.warn` the upstream status when slug resolve returns non-OK (today silent `null` is what turned a 401 into mystery 400s).
5. Document in `packages/workers/.dev.vars.example` / server `.env.example`: *"WORKER_SERVER_SECRET is owned by /env/.env.shared — run pnpm secrets:sync."*

### Acceptance criteria
- Rotating one side only makes `pnpm dev` (edge) fail within seconds with a message naming both files.
- `pnpm secrets:sync` converges both files idempotently; safe to run repeatedly.
- Neither side ever logs the secret value itself.
- CI catches a deliberately mismatched fixture.

---

## References

- Supabase self-hosting env model (single `.env` + compose `env_file`)
- Flagsmith deployment docs (same pattern)
- Cloudflare Workers templates: per-package `.dev.vars` generated by init scripts (no include mechanism — confirmed constraint)
- Turborepo docs: environment variable management & drift warnings across apps
