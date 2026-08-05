# Build master index — what’s next

> **Date:** 2026-08-05  
> **Status:** **Canonical entry point** for remaining build work. Each row links to the **source doc** that owns detail, acceptance criteria, and checklists.  
> **Rule:** When you ship something, update the **source doc first**, then tick the row here.

---

## How to use this file

1. Start with **[Recommended order](#recommended-build-order)** — sequenced by dependency and business value.
2. Pick a track from **[Remaining work by track](#remaining-work-by-track)** — every open item points to one authoritative doc.
3. Use **[Doc index](#doc-index-authoritative-sources)** when you need specs, RFCs, or runbooks.
4. Ignore stale `[ ]` boxes in older sections of [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) — the **Implementation checklist (copy for PRs)** at the bottom is current.

---

## Platform snapshot (2026-08-05)

| Area | Status | Evidence |
|------|--------|----------|
| Ops + API + UI E2E batch | **60/60 PASS** | [`E2E-OPS-BATCH-VALIDATION.md`](../2026-08-04/E2E-OPS-BATCH-VALIDATION.md) |
| Vault + integrations admin + OAuth | Shipped | [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) § checklist |
| Comms (email/SMS/in-app inbox + SSE + prefs) | Shipped (v1) | [`IN-APP-INBOX-SSE.md`](../2026-08-04/IN-APP-INBOX-SSE.md), [`COMMUNICATIONS-PLATFORM-RFC.md`](../2026-08-04/COMMUNICATIONS-PLATFORM-RFC.md) |
| Webhooks (inbound + outbound) | Shipped (v1) | [`WEBHOOKS-DOMAIN-SPEC.md`](../2026-08-04/WEBHOOKS-DOMAIN-SPEC.md) |
| Mastra orchestrate (mock + tools + UI) | Shipped (mock path) | [`AGENT-PHASE-2-MASTRA-SPEC.md`](../2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md), [`AGENT-ORCHESTRATE-DEMO.md`](../2026-08-04/AGENT-ORCHESTRATE-DEMO.md) |
| Keto document scope + folders (F1–F3) | Shipped | [`FOLDERS-SCOPE-PLAN.md`](../2026-08-03/FOLDERS-SCOPE-PLAN.md) |
| Visual editor (phases A–D) | Shipped; **smoke pending** | [`VISUAL-EDITOR-BUILD-PLAN.md`](../2026-08-01/VISUAL-EDITOR-BUILD-PLAN.md) |
| Live CRDT collab | **Deferred** | [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md) |
| Field-level CMS ACL | **Deferred** | [`FIELD-ACL.md`](../2026-08-01/FIELD-ACL.md) |

---

## Recommended build order

```
NOW     Validation & hardening (low risk, closes gaps from E2E + editor smoke)
        ├── Role matrix smoke (editor@, analyst@)
        ├── Visual editor smoke A5 / B6 / C9
        └── Live LLM orchestrate run (≥3 tools in one job)

NEXT    Product polish on shipped platform
        ├── I-c.6c — marketing compliance (List-Unsubscribe + prefs link)
        ├── Comms delivery analytics (opens/clicks — separate from product analytics)
        ├── Admin soft-nav session refresh + 401 redirect
        └── SSE stream ticket (replace raw JWT in query string — prod hardening)

THEN    Scale & production gates
        ├── B4 — prod Keto deploy (K8s/Vela, internal-only)
        ├── B3 — batch Keto Check on document lists (when slow)
        └── B5 + A′.5 — agent Keto tuples on folders/docs (if agents go multi-tenant prod)

LATER   Explicit product gates only
        ├── Phase C — live CRDT collab ([`ROADMAP-PHASES-B-A-C.md`](../2026-08-03/ROADMAP-PHASES-B-A-C.md))
        ├── Replay P4 — pre-login session stitch + admin filter by user
        ├── Mobile push (FCM/APNs)
        └── Bot SSR / R2 client deploy ([`CLIENT_BUNDLE.md`](../2026-07-11/CLIENT_BUNDLE.md))
```

---

## Remaining work by track

### 0 — Validation (do first)

| ID | Work | Source doc | Notes |
|----|------|------------|-------|
| **V1** | Role matrix smoke — `editor@` (agents yes, integrations no), `analyst@` (observability only) | [`E2E-OPS-BATCH-VALIDATION.md`](../2026-08-04/E2E-OPS-BATCH-VALIDATION.md) § What's next | Extends 60/60 batch |
| **V2** | Visual editor manual smoke — `product_detail` | [`EDITOR-SMOKE-PRODUCT-DETAIL.md`](../2026-08-01/EDITOR-SMOKE-PRODUCT-DETAIL.md) | Many `[ ]` rows; core paths verified 2026-08-01 |
| **V3** | Visual editor smoke B6, C9 | [`VISUAL-EDITOR-BUILD-PLAN.md`](../2026-08-01/VISUAL-EDITOR-BUILD-PLAN.md) | Layer drag, Hero image, duplicate block |
| **V4** | Live Mastra orchestrate (not mock) — analytics → layout → content in one job | [`AGENT-PHASE-2-MASTRA-SPEC.md`](../2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md) §7 | Needs Vault LLM key + ops env |
| **V5** | Confirm mock orchestrate acceptance (`MASTRA_ORCHESTRATE_MOCK=true`) | Same spec §7 | E2E uses mock; formal sign-off in spec still open |

---

### 1 — Communications & notifications

| ID | Work | Source doc | Notes |
|----|------|------------|-------|
| **C1** | I-c.6c — List-Unsubscribe + prefs link in marketing template footer | [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) | Only open I-c checklist item |
| **C2** | Comms **delivery** analytics (opens/clicks/bounces) | [`COMMS-DELIVERY-ANALYTICS.md`](../2026-08-04/COMMS-DELIVERY-ANALYTICS.md) | Distinct from product analytics |
| **C3** | SSE stream ticket endpoint (60s TTL) instead of raw JWT in query | [`IN-APP-INBOX-SSE.md`](../2026-08-04/IN-APP-INBOX-SSE.md) § Future | Edge query-token fix shipped (F8 in E2E doc) |
| **C4** | Mobile push channel (FCM/APNs) | Same SSE doc § Future | Same `notify()` trigger pattern |
| **C5** | Trigger catalog product decisions (platform-owned vs merchant-defined) | [`COMMUNICATIONS-PLATFORM-RFC.md`](../2026-08-04/COMMUNICATIONS-PLATFORM-RFC.md) § Open questions | RFC “not yet product feature” gaps mostly closed in code — update RFC when C2 ships |

---

### 2 — Agents & identity

| ID | Work | Source doc | Notes |
|----|------|------------|-------|
| **A1** | Agent Keto subject `Agent:{id}` on document/folder Check | [`ROADMAP-PHASES-B-A-C.md`](../2026-08-03/ROADMAP-PHASES-B-A-C.md) B5, A′.5 | Registry + owner review shipped; tuple enforcement open |
| **A2** | Short-lived agent token / embed flow | [`IDENTITY-AGENTS-MASTER-PLAN.md`](../2026-08-03/IDENTITY-AGENTS-MASTER-PLAN.md), [`ROADMAP-PHASES-B-A-C.md`](../2026-08-03/ROADMAP-PHASES-B-A-C.md) A′.3 | For iframe / API embed |
| **A3** | ZITADEL machine user / PAT verification (R6/R7) | [`IDENTITY-AGENTS-MASTER-PLAN.md`](../2026-08-03/IDENTITY-AGENTS-MASTER-PLAN.md) | Gate before prod agent scale |
| **A4** | Agent auto-publish on approve | [`AGENT-PHASE-2-MASTRA-SPEC.md`](../2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md) §8 | **Out of scope** — human publish only |
| **A5** | Cross-task Mastra memory (30-day) | Same §8 | Phase 2.2+ |
| **A6** | Storefront agent chat UI | Same §8 | Not planned v1 |

**Already shipped (do not rebuild):** registered agents, owner-scoped task review, orchestrate UI, mock executor, `input.notify`, document tools — see [`AGENT-OWNERSHIP-AND-REVIEW.md`](../2026-08-03/AGENT-OWNERSHIP-AND-REVIEW.md).

---

### 3 — Scope, Keto, folders

| ID | Work | Source doc | Notes |
|----|------|------------|-------|
| **K1** | Batch Keto Check on document list endpoints | [`ROADMAP-PHASES-B-A-C.md`](../2026-08-03/ROADMAP-PHASES-B-A-C.md) B3 | When lists slow at scale |
| **K2** | Prod Keto — K8s/Vela, TLS, migrate job | Same doc B4, [`KETO-ZANZIBAR-SETUP.md`](../2026-08-03/KETO-ZANZIBAR-SETUP.md) | Required before real multi-tenant prod |
| **K3** | F1–F3 flat/tree/sidebar folders | [`FOLDERS-SCOPE-PLAN.md`](../2026-08-03/FOLDERS-SCOPE-PLAN.md) | **Marked shipped** — verify + close stale B-F rows in ROADMAP-PHASES doc |

---

### 4 — Admin UX & client architecture

| ID | Work | Source doc | Notes |
|----|------|------------|-------|
| **U1** | Session refresh on `visibilitychange` / TTL | [`ADMIN-SOFT-NAV-HANDOFF.md`](../2026-08-03/ADMIN-SOFT-NAV-HANDOFF.md) | Soft nav shipped; follow-ups open |
| **U2** | Central 401 → `clearSession()` + login redirect | Same doc | Today: error banner on schema fetch |
| **U3** | Catalog hash refresh on soft nav | Same doc | After tenant catalog publish |
| **U4** | Prefetch panel spec on sidebar hover | Same doc | Optional perf |
| **U5** | Client architecture checklist (no fetch in components, etc.) | [`CLIENT-UI-ARCHITECTURE-AUDIT.md`](../2026-08-01/CLIENT-UI-ARCHITECTURE-AUDIT.md) | Guardrails for new UI |
| **U6** | P2 architecture cleanup (Zod at public HTTP boundaries) | [`ARCHITECTURE-AUDIT.md`](../2026-07-31/ARCHITECTURE-AUDIT.md) | When exposing APIs publicly |

---

### 5 — Observability & analytics

| ID | Work | Source doc | Notes |
|----|------|------------|-------|
| **O1** | Replay P4a — pre-login events in same session (query-time join) | [`ANALYTICS-REPLAY-PENDING.md`](../2026-07-27/ANALYTICS-REPLAY-PENDING.md) | No ClickHouse backfill |
| **O2** | Replay P4b — admin filter sessions by user | Same doc | Depends on O1 |
| **O3** | Replay compression | Same doc | Not started |
| **O4** | Playwright E2E for replay | Same doc | Deferred |
| **O5** | Flags per-user targeting — SDK `contextProperties` | [`FLAGS-PER-USER-TARGETING.md`](../2026-07-27/FLAGS-PER-USER-TARGETING.md) | Checklist open |
| **O6** | ClickHouse optional `user_id` column | [`ANALYTICS-REPLAY-PENDING.md`](../2026-07-27/ANALYTICS-REPLAY-PENDING.md) | In `meta` today |

---

### 6 — Visual editor & collab

| ID | Work | Source doc | Notes |
|----|------|------------|-------|
| **E1** | Complete smoke checklists (A5, B6, C9) | [`VISUAL-EDITOR-BUILD-PLAN.md`](../2026-08-01/VISUAL-EDITOR-BUILD-PLAN.md), [`EDITOR-SMOKE-PRODUCT-DETAIL.md`](../2026-08-01/EDITOR-SMOKE-PRODUCT-DETAIL.md) | Phases A–D code done |
| **E2** | Remaining gap items (two-tab 409, publish/exit visitor view) | [`VISUAL-EDITOR-GAP-ANALYSIS.md`](../2026-08-01/VISUAL-EDITOR-GAP-ANALYSIS.md) | Manual tests |
| **E3** | Live CRDT / presence | [`VISUAL-EDITOR-COLLAB-CRDT.md`](../2026-08-01/VISUAL-EDITOR-COLLAB-CRDT.md) | **Do not start** until product gate ([`ROADMAP-PHASES-B-A-C.md`](../2026-08-03/ROADMAP-PHASES-B-A-C.md) Phase C) |

---

### 7 — Infrastructure & edge (deferred / scale)

| ID | Work | Source doc | Notes |
|----|------|------------|-------|
| **I1** | Bot SSR (React 19 stream) in worker | [`CLIENT_BUNDLE.md`](../2026-07-11/CLIENT_BUNDLE.md) | SEO prerender TODO |
| **I2** | Client bundle deploy to R2 | Same doc | Post-build upload script |
| **I3** | Tenant MF remote catalog actions | [`CLIENT-ACTIONS.md`](../2026-07-25/CLIENT-ACTIONS.md) | Phase 2+ |
| **I4** | Machine engine — full XState wrapper + AI-generated definitions | [`ARCHITECTURE_DECISIONS.md`](../2026-07-04/ARCHITECTURE_DECISIONS.md) | Long-horizon |
| **I5** | New org provisioning checklist automation | [`PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md`](../2026-08-04/PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md) | ZITADEL org + Keto tuples |

---

### 8 — Explicitly not building (avoid duplicate work)

| Skip | Why | Source |
|------|-----|--------|
| Noti as separate service | Platform comms in `domains/notifications` | Integrations roadmap FAQ |
| `org_secrets` Postgres table | Vault only | Same |
| Nostr as core IdP/storage | Postgres + ZITADEL | [`IDENTITY-AGENTS-MASTER-PLAN.md`](../2026-08-03/IDENTITY-AGENTS-MASTER-PLAN.md) |
| Field-level ACL | Document unit is enough | [`FIELD-ACL.md`](../2026-08-01/FIELD-ACL.md) |
| SpiceDB / OpenFGA second engine | Keto only | [`ROADMAP-PHASES-B-A-C.md`](../2026-08-03/ROADMAP-PHASES-B-A-C.md) |
| Agent auto-publish | Human approves publish | [`AGENT-OWNERSHIP-AND-REVIEW.md`](../2026-08-03/AGENT-OWNERSHIP-AND-REVIEW.md) |

---

## Doc index (authoritative sources)

### Start here by question

| Question | Read first |
|----------|------------|
| What do we build next in order? | **This file** § Recommended build order |
| What’s left on integrations/agents/comms? | [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) — bottom checklist |
| How do I run/verify E2E? | [`E2E-OPS-BATCH-VALIDATION.md`](../2026-08-04/E2E-OPS-BATCH-VALIDATION.md) |
| Keto / folders / agents phases? | [`ROADMAP-PHASES-B-A-C.md`](../2026-08-03/ROADMAP-PHASES-B-A-C.md) |
| Mastra orchestrate spec? | [`AGENT-PHASE-2-MASTRA-SPEC.md`](../2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md) |
| Inbox SSE architecture? | [`IN-APP-INBOX-SSE.md`](../2026-08-04/IN-APP-INBOX-SSE.md) |
| Visual editor status? | [`VISUAL-EDITOR-BUILD-PLAN.md`](../2026-08-01/VISUAL-EDITOR-BUILD-PLAN.md) |

### By domain (engineering)

| Domain | Primary docs | Remaining items in this index |
|--------|--------------|-------------------------------|
| **E2E / QA** | [`E2E-OPS-BATCH-VALIDATION.md`](../2026-08-04/E2E-OPS-BATCH-VALIDATION.md), [`LOCAL-SMOKE-TEST.md`](../2026-07-31/LOCAL-SMOKE-TEST.md) | §0 Validation |
| **Vault & secrets** | [`VAULT-CLIENT-SECRETS.md`](../2026-08-04/VAULT-CLIENT-SECRETS.md), [`SECRETS-RESOLVER-CACHE.md`](../2026-08-04/SECRETS-RESOLVER-CACHE.md) | Shipped — polish only |
| **Integrations & OAuth** | [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md), [`nango-domain.md`](../2026-07-04/nango-domain.md) | C1 |
| **Comms & email templates** | [`COMMUNICATIONS-PLATFORM-RFC.md`](../2026-08-04/COMMUNICATIONS-PLATFORM-RFC.md), [`EMAIL-TEMPLATES-REACT-EMAIL.md`](../2026-08-04/EMAIL-TEMPLATES-REACT-EMAIL.md) | C1–C5 |
| **In-app inbox & SSE** | [`IN-APP-INBOX-SSE.md`](../2026-08-04/IN-APP-INBOX-SSE.md) | C3–C4 |
| **Webhooks** | [`WEBHOOKS-DOMAIN-SPEC.md`](../2026-08-04/WEBHOOKS-DOMAIN-SPEC.md), [`WEBHOOKS-PLATFORM-RFC.md`](../2026-08-04/WEBHOOKS-PLATFORM-RFC.md) | Shipped v1 — machine transition wiring ongoing |
| **Agents & Mastra** | [`AGENT-PHASE-2-MASTRA-SPEC.md`](../2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md), [`AGENT-ORCHESTRATE-DEMO.md`](../2026-08-04/AGENT-ORCHESTRATE-DEMO.md), [`AGENT-OWNERSHIP-AND-REVIEW.md`](../2026-08-03/AGENT-OWNERSHIP-AND-REVIEW.md) | §0 V4–V5, §2 Agents |
| **Identity & delegation** | [`IDENTITY-AGENTS-MASTER-PLAN.md`](../2026-08-03/IDENTITY-AGENTS-MASTER-PLAN.md), [`ACCESS-AND-ROLES.md`](../2026-08-03/ACCESS-AND-ROLES.md) | §2 A1–A3 |
| **Keto & scope** | [`KETO-ZANZIBAR-ROADMAP.md`](../2026-08-03/KETO-ZANZIBAR-ROADMAP.md), [`FOLDERS-SCOPE-PLAN.md`](../2026-08-03/FOLDERS-SCOPE-PLAN.md), [`KETO-IMPLEMENTATION-CHECKLIST.md`](../2026-08-03/KETO-IMPLEMENTATION-CHECKLIST.md) | §3 K1–K2 |
| **Visual editor** | [`VISUAL-EDITOR-BUILD-PLAN.md`](../2026-08-01/VISUAL-EDITOR-BUILD-PLAN.md), [`VISUAL-EDITOR-GAP-ANALYSIS.md`](../2026-08-01/VISUAL-EDITOR-GAP-ANALYSIS.md), [`EDITOR-SMOKE-PRODUCT-DETAIL.md`](../2026-08-01/EDITOR-SMOKE-PRODUCT-DETAIL.md) | §0, §6 |
| **Admin client** | [`ADMIN-SOFT-NAV-HANDOFF.md`](../2026-08-03/ADMIN-SOFT-NAV-HANDOFF.md), [`CLIENT-UI-ARCHITECTURE-AUDIT.md`](../2026-08-01/CLIENT-UI-ARCHITECTURE-AUDIT.md) | §4 |
| **Observability** | [`OBSERVABILITY-AND-TRACES.md`](../2026-08-03/OBSERVABILITY-AND-TRACES.md), [`ANALYTICS-REPLAY-PENDING.md`](../2026-07-27/ANALYTICS-REPLAY-PENDING.md), [`OBSERVABILITY-AUTH-MODEL.md`](../2026-07-27/OBSERVABILITY-AUTH-MODEL.md) | §5 |
| **Architecture** | [`ARCHITECTURE-PATTERNS.md`](../2026-07-31/ARCHITECTURE-PATTERNS.md), [`ARCHITECTURE-AUDIT.md`](../2026-07-31/ARCHITECTURE-AUDIT.md), [`ARCHITECTURE-MAP.md`](../2026-07-25/ARCHITECTURE-MAP.md) | §4 U6 |
| **Permissions (platform)** | [`PERMISSIONS-MASTER-PLAN.md`](../2026-07-27/PERMISSIONS-MASTER-PLAN.md) | Layer 1 done |
| **Product / vision** | [`product/README.md`](../product/README.md) | Not a build backlog |

### Approval / phase briefs (read before large work)

| Doc | Role |
|-----|------|
| [`ROADMAP-PHASES-B-A-C.md`](../2026-08-03/ROADMAP-PHASES-B-A-C.md) | Layers B / A′ / C — decision table still says “for review”; **update** now that folders + agents v1 shipped |
| [`ROADMAP-PHASES.md`](../2026-07-25/ROADMAP-PHASES.md) | Older phase naming — use B-A-C doc for auth/agents |
| [`PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md`](../2026-08-04/PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md) | Palette + provisioning narrative |

---

## Stale docs to refresh (housekeeping)

These still show open checkboxes or “pending” language but code/E2E says otherwise. Update them when touching the area:

| Doc | Stale section | Reality (2026-08-05) |
|-----|---------------|----------------------|
| [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) | Top “Code deliverables” `[ ]` under I-a, I-b, I-f | Bottom checklist mostly `[x]` |
| [`ROADMAP-PHASES-B-A-C.md`](../2026-08-03/ROADMAP-PHASES-B-A-C.md) | B-F1 “remaining”, A′.7 “Admin UI missing” | Folders + agents admin shipped |
| [`COMMUNICATIONS-PLATFORM-RFC.md`](../2026-08-04/COMMUNICATIONS-PLATFORM-RFC.md) | “No SMS / in-app” | SMS + inbox + SSE shipped |
| [`E2E-OPS-BATCH-VALIDATION.md`](../2026-08-04/E2E-OPS-BATCH-VALIDATION.md) | Integrations “not split collapsible” | F7 fixed — collapsible sections |
| [`AGENT-PHASE-2-MASTRA-SPEC.md`](../2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md) | Mock path `[ ]` | Mock orchestrate used in E2E |

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-05 | Created master index after 60/60 E2E pass + SSE edge fix (F8) |
