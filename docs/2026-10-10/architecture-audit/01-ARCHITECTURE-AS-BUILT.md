# 01 — Architecture As Built

**Audit date:** 2026-10-10 · **Scope:** full repository `C:\Workspace\noname` · **Method:** static code inspection, read-only. No file was modified except this report set.

This document describes what the system **actually is** in the current checkout, independent of what the documentation claims. Every claim is traceable to code.

---

## 1. What the product is

`README.md:3` — "AI-native platform. One server replaces CMS, analytics, A/B testing, personalization, and AI content generation. UI is JSON. AI generates it."

Refined by `apps/docs/docs/decisions/ADR-0001-platform-as-contract.md` and `ADR-0008`:

```text
intent / specification (JSON documents, layout specs, machine definitions)
  → shared platform runtime (server domains + documents + auth + evidence)
  → vertical capabilities (business semantics)
  → extension / client surface (catalog components, actions, admin UI)
  → observable and auditable product (analytics + Evidence)
```

Commerce is explicitly **not** the product identity — it is the first proving vertical (`ADR-0001`, `ADR-0006`, `docs/2026-07-04/ARCHITECTURE_DECISIONS.md:10`).

---

## 2. Repository shape (actual)

12 workspace packages (`pnpm-workspace.yaml:1-2` globs `packages/*`) plus one out-of-workspace app:

| Package | TS/TSX files | Role | Health (see 03) |
|---|---:|---|---|
| `packages/server` | ~700 | Hono API + 17 DDD domains, workers, composition root | Large, inconsistent skeleton |
| `packages/client` | 294 | React 19 + `@json-render/react` runtime, core/admin/editor catalogs, MF host | Strong UI rules, 6-way registry drift |
| `packages/extensions` | 18 | Commerce extension: components, actions, schemas, cart/orders UI | Publishes `@noname/client` dep (upward) |
| `packages/verticals` | ~9 | Commerce business capabilities, checkout mapping, order projection | Illegal `@noname/server` dep |
| `packages/documents` | 19 | Shared CMS/rich-text/refs/locale logic | Genuinely pure |
| `packages/auth` | 24 | Actors, permissions, JWT/OIDC helpers | Zero runtime deps, safe |
| `packages/shared` | 3 | `coerce-scalar-string`, `store-slug`, `comms-providers` | One domain leak |
| `packages/workers` | ~20 | Cloudflare edge: JWT, HMAC, KV, bot SSR | Works; no DB access |
| `packages/browser-sdk` | 16 | Analytics/errors/trace/replay SDK | 0 tests |
| `packages/seeding` | ~6 | Platform/commerce/full seed profiles | Bypasses every package boundary |
| `packages/fixtures` | 3 | Pure fixture data (notifications only) | Root module is `export {}` |
| `packages/cli` | 1 (42 lines) | Commander stub, referenced nowhere | Dead weight |
| `apps/docs` | 58 md pages | Docusaurus + Diátaxis + ADR-0001…0011 | Out of workspace |

**Contradiction with documentation:** `docs/2026-07-04/ARCHITECTURE_DECISIONS.md:208` says "Two packages: server + cli" and `:28` says catalog/types packages "were empty and deleted". `README.md:131` still says "9 DDD domains". There are **12 packages** and **17 server domains**.

---

## 3. Runtime topology

```text
browser ──▶ client :5173 (React + json-render)
              │  /api proxy
              ▼
        edge worker :8787 (Cloudflare/Hono)
          ├─ JWT validation (@cfworker/jwt + JWKS cache)
          ├─ org resolution (Host slug → orgId)
          ├─ HMAC signing  x-org-id : x-user-id : x-role
          ├─ KV cache (slug 300s, bot-schema 300s, jwks 3600s)
          └─ bot SSR (react-dom/server.edge → HTML)
              │  API_ORIGIN
              ▼
        API server :3000 (Hono + Node)
          ├─ orgMiddleware: HMAC verify → Ctx{orgId,userId,role}
          ├─ 17 domain route groups on one Hono app
          ├─ BullMQ workers started as a construction side-effect
          └─ outbound: Postgres, Dragonfly, ClickHouse, ZITADEL, Keto,
                       S3/R2, Vault, Nango, LLM providers
```

Verified: the edge worker has **no** direct DB/Node/`process.env` access (grep over `packages/workers` is clean); it uses WebCrypto only. This part of the design holds.

---

## 4. The 17 server domains and their real structure

The documented skeleton (`README.md:208`) is `ports.ts → entity.ts → service.ts → adapters/postgres.ts → api.ts → index.ts`. **Only `documents` matches it in full.**

| Domain | ports | entity | service | adapters/ | api/routes | schema | Notes |
|---|:-:|:-:|:-:|:-:|:-:|:-:|---|
| documents | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | the reference implementation |
| agent | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | + `mastra/`, `collab/` |
| flags | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | + `evaluation.ts` |
| machines | ✅ | — | ~`engine.ts` | ✅ | ✅ | ✅ | two tables (§6) |
| notifications | ✅ | — | ✅ | ✅ | ✅ | ✅ | + `outbound.ts`, queue/worker |
| webhooks | ✅ | — | ✅ | ✅ | ✅ | ✅ | |
| analytics | ✅ | — | ✅ | ✅ | ✅ | — | ClickHouse only |
| auth | ✅ | — | ✅ | ✅ | ✅ | — | **service imports ZITADEL adapters directly** |
| ai-pipeline | ✅ | — | ✅ | ✅ | ✅ | ✅ | |
| integrations | ✅ | — | ✅ | ✅ | — | ~ | commerce/Stripe hard-coded |
| tenant | ✅ | — | ✅ | ✅ | ✅ | — | bundler in-process |
| audiences | ✅ | — | ✅ | ✅ | — | ✅ | |
| edge | ✅ | — | ✅ | — | ✅ | — | |
| secrets | ✅ | — | ✅ | ✅ | — | — | no routes |
| evidence | ✅ | — | — | ✅ | — | ✅ | adapter doubles as service |
| capabilities | — | — | — | — | — | ✅ | infra in domain root |
| collab | — | — | — | — | — | ✅ | 25+ flat root files |

**3 of 17 have `entity.ts`; 13 of 17 have `ports.ts`; 2 skip the layer entirely.** Route files are `api.ts` (10), `routes.ts` (4), `routes/` (5) — three conventions for one concept.

---

## 5. Where business meaning actually lives (Commerce)

The ownership split recorded in `ADR-0006` / `apps/docs/docs/architecture/package-boundaries.md` is:

| Layer | Location | Contents |
|---|---|---|
| Business semantics | `packages/verticals/src/commerce` | capabilities, checkout-flow, order-projection, money, activity-projection |
| Presentation + actions | `packages/extensions/src/commerce` | 11 catalog components, actions, schemas, cart UI, Orders admin |
| Generic platform | `packages/server/src/domains` | machines, capabilities, integrations, evidence, documents, auth, ports |

**Verdict: mostly followed, with three verified leaks of commerce into generic code:**

1. `packages/server/src/domains/machines/routes/instances.ts:25` — `const CART_MACHINE = "cart"`, plus hard-coded cart routes (`/cart/start`, `/cart/:id`, `/cart/:id/:event`), `CLIENT_CART_EVENTS`, and `PAYMENT_SUCCEEDED`/`PAYMENT_FAILED` handling (`:68-221`).
2. `packages/server/src/domains/integrations/extension-dispatcher.ts:52-59` — `COMMERCE_BACKEND_URL`, `extension: "commerce"`, `events: ["stripe/checkout.session.completed"]`.
3. `packages/server/src/domains/documents/adapters/postgres.ts:92-93` — SQL reaching into `data->'integrations'->'stripe'->>'connectionId'` and `googleMail`.

The counter-evidence is real: `machines/schema.ts:16-28` documents the intended generic contract, and `packages/verticals` genuinely exists.

---

## 6. Data layer

| Store | Owns | Notes |
|---|---|---|
| **Postgres** | documents, document_ops, evidence (4 tables), flags + flag_evaluations, machine definitions/instances/transitions, audiences (10+ tables), notifications, webhooks, integrations receipts, tenant, secrets, collab | One instance, no pooler, one pool of 10 per process |
| **ClickHouse** | analytics events (MergeTree, monthly partitions, 90-day TTL) | **Boot-gates the API** (see 05 §1) |
| **Dragonfly/Redis** | BullMQ (7 queues), event-bus pub/sub, SSE fan-out, collab relay, manifests | Single point of failure |
| **S3/R2** | assets, replay blobs, tenant bundles, Automerge chunks | |
| **ZITADEL / Keto** | identity, orgs, roles; authorization | |
| **Vault** | BYOK + platform secrets | |

Two structural observations verified in code:

- The `documents` domain was **consolidated further than documented**: `ARCHITECTURE_DECISIONS.md:94` says "`content_entries` + `layouts` tables", but `documents/schema.ts:15-30` documents **one** table owning every versioned JSON document, discriminated by `type`, with the type registry at `:114-127` and an append-only op log at `:130-150`. The consolidation is recorded only in a code comment.
- The `machines` domain carries **two overlapping definition tables**: `machineDefinitions` (`machines/schema.ts:31`) and `machines` (`:94`).

---

## 7. The spec-driven UI pipeline (as built)

```text
URL
 → templateFromPath / resolveRoute          platform-routes.ts:35-228
 → GET /api/edge/schema/:siteId?template=…  use-app-page-loader.ts:232
 → documents domain resolves tenant layout  server domains/documents
 → Spec { root, elements, state }
 → <JSONUIProvider handlers store><Renderer spec registry/>   catalog-ui-shell.tsx:80
```

Confirmed as the real path for **all** org-facing surfaces. There is **no** react-router, no `pages/` tree. The only non-spec surfaces are:

- the visual editor (`?edit=true`) — the skill's **named exception** (`skills/spec-driven-ui/SKILL.md:39`);
- `/auth/callback` — defensible thin OAuth handler;
- host plumbing: `main.tsx` `AuthBar`, `editor-gate.tsx`, `admin-panel-prefetch.ts`.

**Caveat:** admin *chrome* is not actually renderer-driven. `platform/admin-platform-view.tsx:94` instantiates `<AdminShell props={shellProps as never}>` directly, and `platform/admin-layout.ts:8-12` reads only `rootEl.props`. Children, `visible`, and `$state` in the admin shell layout are ignored. The claim "every org-facing page loads from layout spec" is therefore ~90% true, not 100%.

---

## 8. Observable divergence between documentation and code

| Documented | Actual | Evidence |
|---|---|---|
| "Pure API server, no React, no SSR, no JSX" | React email renderer + rspack/ModuleFederation build toolchain in `packages/server` | `notifications/email-template.ts:2`, `tenant/adapters/bundler.ts:5-6`, `packages/server/package.json:30,46-48` |
| "9 DDD domains" | 17 domains | `packages/server/src/domains/` |
| "Two packages: server + cli" | 12 packages + `apps/docs` | `pnpm-workspace.yaml`, package dirs |
| "In-memory event bus for Phase 0" | Redis pub/sub fan-out across replicas | `shared/event-bus.ts:1-2,7,28-55` |
| Edge personalization complete | `POST /api/edge/personalize` no longer exists; `renderer.ts:1` is a 3-line stub | `packages/workers/src/renderer.ts` |
| `content_entries` + `layouts` tables | one `documents` table + type registry | `documents/schema.ts:15-30` |
| "Adding a flow = adding a JSON definition, not new code" | checkout semantics are TypeScript in `verticals` + a string-keyed capability registry | `capability registry.ts:56-59`, `verticals/src/commerce/checkout-flow.ts` |
| Catalog lives in `packages/client/src/catalog.ts` | that module is orphaned dead code; live catalog is `platform/registry.ts` + `admin/registry.ts` + editor + extension registries | `ARCHITECTURE_DECISIONS.md:28` vs `catalog.ts` (0 importers) |

---

## 9. Quality gates present

| Gate | Status |
|---|---|
| Biome lint/format | Present, **recommended preset only**; `noExplicitAny: off` (`biome.json:26`) |
| TypeScript typecheck | Present per package |
| Vitest | 150 test files; `coverage.include` scoped to `packages/server/src` only (`vitest.config.ts`) |
| Architecture/boundary tests | **None** |
| Convention tests (flat props, no-fetch-in-catalog, registry parity) | **None** |
| CI (GitHub Actions / GitLab / any) | **None** (`.github/`, `.gitlab-ci.yml`, `.circleci` all absent) |
| Boot-time env validation | **None** (only scattered inline throws) |
| Metrics/alerting | Traces only — no metrics SDK, no `/metrics`, `/health` always 200 |

---

## 10. Summary judgement

The architecture is **coherent and defensible in intent**, and several hard decisions were genuinely executed (documents consolidation, Evidence kernel, audience/experience replacing `contextHash`, spec-driven UI as the real render path, edge with no DB access). The gap is not the design — it is that the design's **invariants are unenforced** and the **documentation of record is unreliable**:

- no CI, no boundary tests, and no convention tests, so every documented rule drifts silently;
- the 11 ADRs in `apps/docs` stop at 2026-09-14 while decisions continued into `docs/2026-09-26` and `docs/2026-10-*`;
- `docs/2026-07-04/ARCHITECTURE_DECISIONS.md` — the most discoverable architecture document — is banner-stale and materially wrong about packages, domains, the event bus, and rendering.

Details, severity, and fixes are in reports 02–07.
