# Maintainability

> Test coverage, duplication, typing discipline, error handling, CI, secrets hygiene. See [`README.md`](./README.md) for scope/method.

---

## Test coverage

| Package | Source files | Test files | Ratio |
|---|---:|---:|---:|
| `packages/client` | 247 | 16 | **6.5%** |
| `packages/server` (overall) | 360 | 88 | 24.4% |
| `packages/server/domains/context` | 11 | **0** | **0%** |
| `packages/server/domains/machines` | 10 | **0** | **0%** |
| `packages/server/domains/edge` | 6 | 1 | 17% |
| `packages/server/domains/ai-pipeline` | 10 | 1 | 10% |
| `packages/server/domains/flags` | 18 | 1 | 6% |
| `packages/server/domains/webhooks` | 19 | 1 | 5% |
| `packages/server/domains/tenant` | 14 | 1 | 7% |
| `@noname/auth` | 14 | 10 | 71% |
| `@noname/documents` | 11 | 7 | 64% |
| `@noname/shared` | 4 | 2 | 50% |
| `@noname/workers` | 16 | 7 | 44% |
| `@noname/extensions` | 10 | **0** | **0%** |
| `@noname/browser-sdk` | 15 | **0** | **0%** |
| `@noname/cli` | 1 | 0 | 0% (scaffold only) |

**Read:** coverage is bimodal. The small, pure-logic shared packages (`auth`, `documents`, `shared`, `workers`) are well tested — 44–71%. Everything with meaningful UI or orchestration logic is not: `client` at 6.5% with zero tests on `main.tsx`, routing, or any admin panel; `browser-sdk` (analytics/session-replay/error-tracking SDK, 1,616 LOC) and `extensions` (commerce + rich-text catalogs) at exactly 0%; and two full server domains (`context`, `machines`) at 0%.

`vitest.config.ts` coverage collection is scoped to `packages/server/src/**` only, with no `thresholds` configured — so even the numbers above aren't enforced anywhere; they can regress freely.

```
11:16:vitest.config.ts
coverage: {
  provider: "v8",
  include: ["./packages/server/src/**/*.ts"],
  ...
}
```
`packages/client` has no `test` script in `package.json` at all, so its 16 existing tests aren't part of any documented workflow.

---

## God files

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full lists (14 server files, 22 client files >300 lines). These matter for maintainability specifically because:
- Large files are harder to review in a PR — a 932-line `ScopeAdminForm.tsx` diff is likely to get a lighter review than a 60-line one.
- Several are the *least*-tested files (e.g. no admin-panel component has a test), so the files most likely to have a subtle regression are also the ones with no safety net.

---

## Typing discipline

| Metric | Server | Client | Scoped packages |
|---|---|---|---|
| `@ts-ignore`/`@ts-expect-error` | 0 | not separately counted, likely 0 | 0 |
| Explicit `any` (`: any`/`as any`) | 6 lines (mostly tests + `.d.ts`) | 0 real usages | 4 (all in `browser-sdk`: `privacy.ts` ×3, `replay.ts` ×1) |
| `as never` escape hatches | n/a | 4 (registry boundaries) | — |
| `unknown` | 635 | not separately counted | — |
| Biome `noExplicitAny` rule | — | `"off"` globally (`biome.json:25-27`) | — |

The volume of literal `any` is genuinely low — better than the "off" lint rule would suggest is tolerated. The real typing debt is the **`as never` casts at the two registry boundaries** (`platform/registry.ts:10`, `editor/registry.ts:42`, `platform/admin-platform-view.tsx:85`) — these exist specifically because the editor and platform action-handler maps don't type-check against their schemas, so someone silenced the compiler instead of fixing the mismatch. That's exactly the kind of thing that hides a real bug (a handler with the wrong signature) until runtime.

`@noname/browser-sdk`'s 4 `any` usages are for legitimately hard-to-type browser globals (`window as any).Cypress`, `navigator as any).globalPrivacyControl`) — lower priority than the registry casts.

---

## Error handling inconsistency

- **163** raw `throw new Error(...)` call sites in server vs. **127** typed `DomainError` subclasses.
- The central HTTP error handler only special-cases `DomainError` and Postgres unique-constraint violations:
  ```6:21:packages/server/src/shared/error-handler.ts
  export function handleDomainError(err: unknown, c: Context): Response | null {
    if (err instanceof DomainError) { ... }
    if (isPostgresUniqueViolation(err)) { ... }
    return null;  // everything else → 500 in index.ts
  }
  ```
  Any of the 163 raw throws that should map to a 400/404 instead becomes an opaque 500, which both hides the real cause from API consumers and makes on-call triage harder (every non-`DomainError` failure looks identical in logs/metrics).
- Concentration of raw throws: `documents/adapters/postgres.ts` (9), `notifications/service.ts` (11), `webhooks/service.ts` (11) — exactly the domains that also have thin test coverage or god-file adapters, compounding risk.

---

## HTTP input validation is inconsistent

| Layer | Validation approach |
|---|---|
| Auth, integrations, webhooks, agent registry routes | Zod schema + `parseBody` at the HTTP boundary |
| Documents routes | Raw `c.req.json<Record<string, unknown>>()`; validation deferred to a service-layer Zod validator generated from the content-type schema |
| Analytics ingest | Custom hand-written parsers, not Zod |
| Machines/flags/context routes | Mixed — several use raw `c.req.json()` with no schema at all |

Roughly half of JSON-body endpoints (23 `parseBody` call sites vs. 27 `c.req.json(` call sites) go through the centralized Zod boundary; the rest rely on downstream validation that may or may not exist for a given field. This isn't necessarily unsafe today (documents does validate, just later), but it means "is this endpoint validated" requires reading the specific route rather than following one rule.

---

## Duplication

- `documents/ports.ts` (493 lines) and a separate `contracts.ts` re-export barrel exist side by side — two import paths for the same types, with no enforced rule on which one to use (confirmed: `auth/index.ts` imports `contracts`, `secrets/index.ts` imports `ports`, for conceptually the same documents surface).
- HMAC sign (worker) / verify (server) implementations are hand-duplicated with no shared contract test (see `ARCHITECTURE.md`).
- `catalogProps` helper is triplicated across `client`, `extensions`, and an inline simplified copy in `scripts/seed/demo.ts` (see `ARCHITECTURE.md`).
- Multiple near-identical inbound email-webhook adapters (Resend, Mailgun, Brevo, SES, SendGrid, Postmark) share the same parse/verify shape without a shared base — a bug fix in one provider's edge case won't propagate to the others.
- `admin/registry.ts` on the client re-exports every admin component twice (an `import` block followed by a matching `export` block, lines 1–49) — pure boilerplate duplication.

---

## CI / tooling gaps

- **`pnpm -r typecheck` fails locally at the repo root** (real TypeScript errors in `packages/server`, e.g. `happy-dom` vs. DOM type conflicts in the agent rich-text/Yjs editor code, nullability errors in agent tools) even though `.github/workflows/ci.yml` runs `pnpm typecheck` as a gate. Either CI is currently red, or it's passing against a different branch state than `main` — either way this needs to be reconciled, because a failing typecheck gate that doesn't actually fail CI defeats its purpose.
- CI runs `pnpm check` (lint) → `pnpm typecheck` → `pnpm test`, with **no `pnpm build` step**, no dependency/security audit, and no coverage threshold enforcement.
- `@noname/cli` has no `typecheck`/`lint`/`test` scripts and is excluded from `pnpm -r typecheck` entirely; it also declares an unused `chalk` dependency.
- Root `tsconfig.json` is scoped only to `scripts/**/*.ts` — the actual packages each have their own tsconfig, which is fine, but means there's no single "does the whole repo typecheck" config; `pnpm -r typecheck` is the only real gate, and it currently fails (see above).

---

## Secrets hygiene

- **`packages/workers/.dev.vars` is tracked in git** and contains a real-looking `WORKER_SERVER_SECRET` (32 characters, not a placeholder pattern like `change-me`). This secret signs the edge→API HMAC trust boundary (`workers/src/hmac.ts`, `server/src/shared/org.ts`).

  **This is a local-dev-only value, not a production incident.** `packages/server/src/shared/org.ts` reads it from `process.env.WORKER_SERVER_SECRET` at runtime and explicitly gates the dev bypass on `NODE_ENV !== "production"` — nothing in the code path suggests this literal value is deployed anywhere real. The team's own [`VAULT-CLIENT-SECRETS.md`](../2026-08-04/VAULT-CLIENT-SECRETS.md) plan already specifies the correct production setup: `WORKER_SERVER_SECRET` should be stored in Vault at `noname/platform/worker_server_secret` and injected at deploy — **never in git, never as a `wrangler.toml`/`.dev.vars` literal.** That's the right design; the gap is purely that the *dev convenience* file for it is checked in, and there's no automated check confirming the Vault path is actually wired end-to-end yet.

  Recommended fix (hygiene, not incident response): add `.dev.vars` to `.gitignore`, commit a `.dev.vars.example` with a placeholder value, and have each developer generate their own local secret (matching value on the server side via `packages/server/.env`). Rotating the specific committed value is good practice before removing it from tracking, but there's no need to treat this as a security incident, notify anyone, or rewrite git history — it never protected anything in production.
- `packages/workers/wrangler.toml` commits real-looking Zitadel client/project IDs (`ZITADEL_CLIENT_ID`, `ZITADEL_PROJECT_ID`) directly, with a comment saying they're meant to be per-developer via `pnpm init:zitadel` — but they're checked in as literal values, so every developer either shares them or has to remember to regenerate and *not* commit the diff.
- `config/zitadel-steps.yaml` commits a literal dev admin password (`NonameAdmin1!`) — acceptable for a local bootstrap script, but worth a comment/README note making explicit that this is dev-only and must never be reused, since it's easy for a script like this to get copied into a shared or staging environment.
- By contrast, `zitadel_keys/*` (service-account JSON, PAT) are correctly gitignored, and `.env`/`.env.example` follow the right pattern. This is a partial-credit situation — the team clearly knows the pattern, it just wasn't applied consistently to `.dev.vars` and `wrangler.toml`.

### What production should actually look like for this secret

Per the existing (approved, not yet fully verified as implemented) [`VAULT-CLIENT-SECRETS.md`](../2026-08-04/VAULT-CLIENT-SECRETS.md) plan:

| Environment | Where `WORKER_SERVER_SECRET` lives | Mechanism |
|---|---|---|
| Local dev | `packages/workers/.dev.vars` (worker side) + `packages/server/.env` (server side) — matching values, developer-generated | Plain env files, gitignored |
| Staging/prod | HashiCorp Vault, path `noname/platform/worker_server_secret` | Server reads via `SecretStorePort.getPlatformSecret("worker_server_secret")` (Vault adapter, AppRole/K8s-SA auth) — **injected at deploy, never read from a committed file** |
| Cloudflare Worker (edge side) in prod | Wrangler **secret** (`wrangler secret put WORKER_SERVER_SECRET`), not a `[vars]` literal in `wrangler.toml` | Wrangler secrets are encrypted at rest and not visible in `wrangler.toml`; `[vars]` entries (like the committed `ZITADEL_CLIENT_ID`) are plaintext by design and fine for non-secret config, but the HMAC secret must never be a `[vars]` entry |

Two follow-ups worth doing, in order of value: (1) confirm the server side actually calls `SecretStorePort.getPlatformSecret` for this value in production rather than only `process.env` (the current `org.ts` code reads `process.env.WORKER_SERVER_SECRET` unconditionally — verify the deploy pipeline injects Vault's value into that env var, or wire a direct Vault read), and (2) confirm the Worker's production deploy uses `wrangler secret put` rather than an env var baked into `wrangler.toml`'s `[env.production]` block (not currently shown as committed there, which is good — just worth a one-line deploy-runbook confirmation).

---

## Scripts folder

- `scripts/seed/demo.ts` is 2,191 lines with no tests, and imports server/client internals via relative paths that don't exist as a published interface (`../../packages/server/src/domains/auth/adapters/zitadel/*`). Any refactor of those internal paths silently breaks the seed script with no compiler warning until someone runs it.
- Zero files under `scripts/` contain any test.
