# Platform master status

> **Date:** 2026-08-06  
> **Tests:** 316 passing · **E2E:** 60/60 PASS  
> **Runbook:** [REMAINING-WORK-RUNBOOK.md](./REMAINING-WORK-RUNBOOK.md) · **Backlog:** [BUILD-MASTER-INDEX.md](./BUILD-MASTER-INDEX.md)

---

## Shipped (v1)

| Area | Evidence |
|------|----------|
| Vault, integrations admin, OAuth, webhooks | [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](../2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) |
| Comms — email/SMS/in-app/SSE/prefs/templates | [`COMMUNICATIONS-PLATFORM-RFC.md`](../2026-08-04/COMMUNICATIONS-PLATFORM-RFC.md) |
| Marketing compliance (List-Unsubscribe) | `marketing-compliance.ts` |
| SSE stream ticket | [`IN-APP-INBOX-SSE.md`](../2026-08-04/IN-APP-INBOX-SSE.md) |
| Agents — registry, orchestrate UI, mock path, Keto tools, `nag.*` tokens | [`AGENT-PHASE-2-MASTRA-SPEC.md`](../2026-08-03/AGENT-PHASE-2-MASTRA-SPEC.md) |
| Keto scope + folders F1–F3 | [`FOLDERS-SCOPE-PLAN.md`](../2026-08-03/FOLDERS-SCOPE-PLAN.md) |
| Visual editor A–D + core smoke | [`EDITOR-SMOKE-PRODUCT-DETAIL.md`](../2026-08-01/EDITOR-SMOKE-PRODUCT-DETAIL.md) |
| Admin soft nav + U1–U4 (401, catalog, prefetch) | [`ADMIN-SOFT-NAV-HANDOFF.md`](../2026-08-03/ADMIN-SOFT-NAV-HANDOFF.md) |
| Welcome email on user invite | `auth/service.ts` → `notify(welcome)` |
| Role matrix V1 | [`E2E-OPS-BATCH-VALIDATION.md`](../2026-08-04/E2E-OPS-BATCH-VALIDATION.md) |
| Replay user stitch + admin search (O1–O2) | [`ANALYTICS-REPLAY-PENDING.md`](../2026-07-27/ANALYTICS-REPLAY-PENDING.md) |
| Replay gzip compression (O3) | SDK `fflate` + worker; R2 `.json.gz` |

---

## Open — do next

| ID | Work | Blocker / owner |
|----|------|-----------------|
| **V4** | Live LLM orchestrate (≥3 tools) | Vault LLM key + `MASTRA_ORCHESTRATE_MOCK=false` |
| **A3** | ZITADEL R6/R7 verify + sign-off | Dev verify — [runbook § A3](./REMAINING-WORK-RUNBOOK.md#a3--zitadel-machine-user--pat-r6--r7) |
| **K2** | Prod Keto deploy | Infra |
| **K1** | Batch Keto Check | When lists slow |

---

## Deferred (do not start unless asked)

| ID | Work |
|----|------|
| **C2** | Comms delivery analytics (opens/clicks) |
| **C4** | Mobile push |
| **E3** | Live CRDT collab |
| **O4** | Playwright E2E for replay |
| **I1–I2** | Bot SSR / R2 client deploy |

---

## Dev quick start

```bash
podman compose up -d
pnpm init:zitadel && pnpm db:push && pnpm seed:demo
pnpm dev
# Store: http://yogastore.localhost:5173
# Admin: admin@zitadel.localhost / NonameAdmin1!
```

---

## Changelog

| Date | Change |
|------|--------|
| 2026-08-06 | Removed separate “embed token” backlog — SDK/partner uses `nag.*` |
| 2026-08-06 | Created master status + `docs/2026-08-06/` folder |
