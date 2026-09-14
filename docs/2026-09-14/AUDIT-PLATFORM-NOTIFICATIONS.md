# Platform notifications documentation audit

**Audit date:** 2026-09-14  
**Assigned scope:** every Markdown file under `docs/2026-08-04/` and `docs/2026-08-05/` (14 documents)  
**Repository basis:** current working tree, source/tests/manifests, `docs/2026-08-06/` status/index files, and relevant history through 2026-09-14.

## Method and repository baseline

All 13 Markdown files in `docs/2026-08-04/` and the one Markdown file in `docs/2026-08-05/` were read in full. Current implementation evidence includes the notifications, secrets, integrations, webhooks, agent, documents, and client modules; their unit tests; package manifests; and the relevant history (`fd34930`, `f8af9c5`, `303c554`, `e581017`, `c3de5a5`, `e690563`, `5996ad1`, `2b74960`, `571ec3d`, `49a28aa`, `5c938ac`, `9d535ed`, `fdfdd6a`, `e2b29e4`, `11a579e`).

The current baseline is materially newer than the assigned documents: communications has email/SMS/in-app, preferences, retries, templates, compliance, and provider delivery-event ingestion; webhooks has inbound/outbound delivery infrastructure and event routing; Vault-backed secrets and optional LLM caching exist; Mastra orchestrate is implemented with a mock path and live path; and the 2026-08-05 index moved to the canonical 2026-08-06 index. Several older documents contain a current status header or a current checklist while retaining contradictory original-plan tables. Those are classified **stale-needs-correction**, not current.

---

## 1. `docs/2026-08-04/AGENT-ORCHESTRATE-DEMO.md`

**Classification:** **current**  
**Disposition:** **Leave** (optionally add a date/commit if this walkthrough is intended as a dated snapshot).

### Factual implementation status

The walkthrough describes the implemented registered-agent → orchestrate-task → progress/artifact review → approve/reject flow. The documented mock/demo path is supported. The feature remains environment-sensitive: the live planner needs credentials, while the mock path is the deterministic validation path. The documented notification/webhook/token side-effect concepts are present, subject to the selected task and enabled integrations.

### Evidence

- `packages/server/src/domains/agent/mastra/executor.ts` — orchestrate enablement, registered-agent tools, including `nango_trigger`.
- `packages/server/src/domains/agent/mastra/mock-orchestrate.ts` — deterministic mock task behavior and tool/artifact output.
- `packages/server/src/domains/agent/task-lifecycle.test.ts`, `packages/server/src/domains/agent/task-notify.test.ts`, `packages/server/src/domains/agent/mastra/mock-orchestrate.test.ts` — task lifecycle, notify, and mock coverage.
- `packages/server/src/domains/webhooks/outbound-router.ts` — `agent.task.completed` outbound fan-out.
- `packages/server/src/domains/notifications/service.ts` — notification fan-out and inbox side effects.
- `docs/2026-08-06/BUILD-MASTER-INDEX.md` §§ platform snapshot/validation — mock orchestrate shipped; live LLM remains an environment gate.
- History: `e581017` (Mastra UI/webhooks), `c3de5a5` (comms and agents).

### Stale claims / limitations

No material stale claim was found. “Default” tool exposure is implementation/configuration dependent rather than a universal guarantee, and live LLM output is not guaranteed by the walkthrough, but the document already calls out the relevant environment and troubleshooting conditions.

---

## 2. `docs/2026-08-04/COMMS-DELIVERY-ANALYTICS.md`

**Classification:** **stale-needs-correction**  
**Disposition:** **Correct** (or replace with a short pointer to the canonical current status).

### Factual implementation status

The central separation is correct: product analytics and provider-sourced communications telemetry are different systems, and the in-app inbox is a third surface. Delivery-event persistence, normalized event types, webhook ingestion, and the delivery API/UI engagement timeline are implemented. The current implementation is broader than the document's Resend-only “v2” wording: adapters and tests exist for Resend, SES, SendGrid, Mailgun, Postmark, Brevo, and Twilio status callbacks.

### Evidence

- `packages/server/src/domains/notifications/schema.ts` — `comms_delivery_events`, linked to `comms_deliveries` with provider-event uniqueness.
- `packages/server/src/domains/notifications/delivery-events.ts` — normalized sent/delivered/opened/clicked/bounce/complaint/delay/failure types and provider mappings.
- `packages/server/src/domains/notifications/provider-webhooks.ts`, `packages/server/src/domains/notifications/routes/webhooks.ts` — webhook parsing and route.
- `packages/server/src/domains/notifications/adapters/email/{resend,ses,sendgrid,mailgun,postmark,brevo}-webhook.ts` and corresponding `*.test.ts`; `packages/server/src/domains/notifications/adapters/sms/twilio-webhook.ts` and test.
- `packages/server/src/domains/notifications/api.ts` — `includeEvents=true` delivery query.
- `packages/server/src/domains/notifications/service.ts` — event rows attached to delivery DTOs.
- `packages/server/package.json` — SES and React Email dependencies.
- `docs/2026-08-06/BUILD-MASTER-INDEX.md` C2 row — delivery analytics shipped.

### Stale claims

- Lines 3, 21–27 label the implementation “v2 shipped” specifically as Resend and imply the scope is only Resend; the repository now has multiple provider adapters and normalized webhook handling.
- Lines 7–14 and 29–33 retain the earlier “deferred/not built/no Resend analytics” v1 comparison, which contradicts the shipped C2 implementation.
- Lines 63–73 present the same capability as future recommended scope, including schema/ingest/UI that already exist.
- The proposed provider path `domains/notifications/adapters/*/webhooks.ts` is directionally right but no longer an accurate inventory of the actual email/sms adapter paths.

### Required correction

Keep the separation/privacy design and OSS study material, but rewrite the status and v1/v2 sections to describe the implemented normalized provider webhook layer, all supported adapters, current route/provider configuration, and any genuinely remaining gaps.

---

## 3. `docs/2026-08-04/COMMUNICATIONS-PLATFORM-RFC.md`

**Classification:** **stale-needs-correction**  
**Disposition:** **Correct**; retain as an RFC/design reference after removing contradictory “today” tables.

### Factual implementation status

The architecture decision and domain boundary remain valid. The v1 platform is implemented: email/SMS/in-app, async queues, Vault credentials, CMS spec rendering, preferences, delivery admin/retry, compliance, SSE/ticketing, and multiple provider adapters. Delivery telemetry is also implemented. The RFC is useful as a design/reference document, but it mixes its updated shipped summary with an old initial-RFC feature matrix and roadmap.

### Evidence

- `packages/server/src/domains/notifications/{ports.ts,service.ts,outbound.ts,queue.ts,worker.ts,schema.ts,api.ts}` — ports, fan-out, queues, delivery storage/API, and worker.
- `packages/server/src/domains/notifications/email-template.ts` and `packages/client/src/components/content/EmailSpecFieldInput.tsx` — published CMS spec rendering and editor.
- `packages/server/src/domains/notifications/preferences.ts` and `marketing-compliance.ts`, with `preferences.test.ts` and `marketing-compliance.test.ts` — preferences and List-Unsubscribe implementation.
- `packages/server/src/domains/notifications/routes/stream.ts` and `stream-ticket.test.ts` — SSE and 60-second ticket path.
- `packages/server/src/domains/notifications/adapters/email/index.ts` and provider adapters — current provider support.
- `packages/server/src/domains/auth/service.ts`, `packages/server/src/domains/notifications/transition-notify.ts` — invite and machine transition notification callers.
- `docs/2026-08-06/BUILD-MASTER-INDEX.md` §§ platform snapshot/C1–C3 — shipped status.
- History: `fd34930`, `f8af9c5`, `c3de5a5`, `5996ad1`, `2b74960`.

### Stale claims

- The “open: I-c.6c, comms delivery analytics” header is stale: I-c.6c and C2 are shipped.
- Lines 76–85 say delivery analytics is deferred and present stream ticket as newly resolved while the document’s own status is inconsistent with current C2/C3 state.
- The feature matrix at lines 146–206 says no delivery UI/API, no idempotency, no SMS, no inbox, narrow preferences, and only agent callers; all are contradicted by current source/tests.
- The must-have/should-have/phase roadmap at lines 210–239 and 338–367 describes work that is already implemented, including SES (or broader providers), retries, trigger routing, inbox/SSE, preferences, and machine wiring.
- The “open questions” and “still not merchant-facing” list does not account for shipped compliance and delivery telemetry.

### Required correction

Preserve the decision, architecture rationale, and future product gaps (for example mobile push and workflow/digest features), but replace the stale feature matrix and roadmap with a current shipped/remaining matrix. Explicitly state that the document is an RFC/design reference, not the authoritative status board.

---

## 4. `docs/2026-08-04/E2E-OPS-BATCH-VALIDATION.md`

**Classification:** **historical**  
**Disposition:** **Mark historical; leave contents unchanged** (the requested audit does not modify existing docs).

### Factual implementation status

This is a dated validation record for the 2026-08-05 local Podman batch. Its 60/60 API/UI/ops result and V1/V5 results are historical evidence, not a current assertion. V4 was explicitly blocked on a live LLM key; that remains an environment-dependent gate in the later 2026-08-06 index. The document is valuable as an immutable test report.

### Evidence

- `packages/server/src/domains/notifications/api.ts`, `routes/stream.ts`, `preferences.ts` — documented notification endpoint and gate shapes.
- `packages/server/src/domains/webhooks/schema.ts`, `service.ts`, `routes/inbound.ts`, `routes/subscriptions.ts` — webhook features exercised by the batch.
- `packages/server/src/domains/agent/mastra/mock-orchestrate.ts` and `mock-orchestrate.test.ts` — mock path used for A5/V5.
- `packages/client/src/core/components/AccountNotificationsInbox.tsx`, `CommsInboxPanel.tsx`, `useCommsInboxStream.ts` — UI surfaces in the record.
- `docs/2026-08-06/BUILD-MASTER-INDEX.md` lines 20–35 and 42–70 — explicitly treats the batch as a 2026-08-05 snapshot and records later shipped work.

### Stale claims / limitations

As a historical test record, its dated credentials, URLs, pass counts, and “last updated 2026-08-05” are not current-environment guarantees. It also records the pre-C2 state and therefore does not cover later delivery analytics/provider expansion. Those are appropriate historical limitations, not defects in a test log.

### Required handling

Add a visible “historical snapshot; rerun before relying on results” marker if/when maintainers choose to edit it. Do not rewrite the recorded results as if they were a 2026-09-14 test run.

---

## 5. `docs/2026-08-04/EMAIL-TEMPLATES-REACT-EMAIL.md`

**Classification:** **stale-needs-correction**  
**Disposition:** **Correct**.

### Factual implementation status

The spec-only CMS model and React Email server/client implementation are current. Published `notification_email` documents are resolved and rendered at enqueue; the client has an `EmailSpecFieldInput`; fixtures/seeding provide demo specs; machine transition notification and user-invite notification callers are wired; and marketing compliance is applied for marketing templates.

### Evidence

- `packages/server/src/domains/notifications/email-template.ts` — `notification_email`, published-document lookup, `renderToHtml`/`renderToPlainText`, no `html_body` fallback.
- `packages/client/src/components/content/EmailSpecFieldInput.tsx` and `content-entry-field-input.tsx` — JSON spec editor/preview wiring.
- `packages/fixtures/src/notifications/email-specs.ts` and `packages/seeding/src/profiles/platform/index.ts` — seeded schemas/specs.
- `packages/server/src/domains/notifications/transition-notify.ts` and `packages/server/src/domains/machines/index.ts` (transition caller) — transition notify parsing/wiring.
- `packages/server/src/domains/auth/service.ts` and `invite-notify.test.ts` — welcome invite notification.
- `packages/server/src/domains/notifications/email-template.test.ts`, `service.test.ts` — rendering and enqueue behavior.
- `packages/server/package.json`, `packages/client/package.json` — React Email dependencies.

### Stale claims

- The status line says “open: wire remaining machine transitions,” but the document’s own I-c.2 checklist says transitions are wired and current `transition-notify.ts` supports them.
- The phase plan’s temporary raw-HTML state is historical; it should be clearly labeled as migration history rather than an active phase.
- The proposed package-install commands and “I-c.2 PR” checklist read as if implementation is pending even though the dependencies and field input are present.

### Required correction

Update the status to shipped, replace “open” with actual remaining gaps (if any), and relabel the temporary raw-HTML section as historical migration context. Keep the architecture and CMS editing guidance.

---

## 6. `docs/2026-08-04/IN-APP-INBOX-SSE.md`

**Classification:** **stale-needs-correction**  
**Disposition:** **Correct**.

### Factual implementation status

Per-user/org inbox persistence, preference-aware `notify()` in-app fan-out, Redis-backed cross-replica SSE broadcast, account/admin surfaces, REST list/read endpoints, and stream tickets are implemented. Raw access-token query auth remains a legacy compatibility path; the client now mints a stream ticket.

### Evidence

- `packages/server/src/domains/notifications/schema.ts` — `comms_inbox_items`.
- `packages/server/src/domains/notifications/service.ts` — insert, preference gate, `broadcast`, and event payload.
- `packages/server/src/domains/notifications/routes/stream.ts` — ticket minting, ticket verification, SSE connection/heartbeat, legacy token fallback.
- `packages/server/src/shared/sse-manager.ts` — local map and Redis fan-out.
- `packages/client/src/core/hooks/useCommsInboxStream.ts` — client ticket mint and EventSource.
- `packages/client/src/core/components/CommsInboxPanel.tsx`, `packages/client/src/core/components/AccountNotificationsInbox.tsx`, `packages/client/src/admin/components/integrations/CommsInboxAdmin.tsx` — separate shared/admin/account UI components.
- `packages/server/src/domains/notifications/stream-ticket.test.ts`, `service.test.ts` — stream and inbox coverage.

### Stale claims

- Line 88 says admin and account inbox “both use `CommsInboxPanel`”; the account page has the separate `AccountNotificationsInbox` wrapper/component, even if it composes shared behavior.
- The main SSE section presents raw `?access_token=` as “current v1” without prominently making the later ticket path canonical; the stream-ticket section is later and should be promoted to the primary behavior.
- The opening “requires ops batch before live smoke test” is a dated operational prerequisite, not current implementation status.

### Required correction

Make stream tickets the primary documented flow, describe legacy query-token compatibility separately, and correct the client component inventory. Keep Redis’s cross-replica/local fallback explanation and the future push-channel scope.

---

## 7. `docs/2026-08-04/INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`

**Classification:** **stale-needs-correction**  
**Disposition:** **Correct**; retain as roadmap/design reference after separating completed work from future work.

### Factual implementation status

Vault, integrations BYOK, Nango connect plumbing, notifications, webhooks, agent context/tools, and mock Mastra orchestrate are implemented. The bottom “Implementation checklist” is the closest current section, but the document still contains many earlier planned layouts, phase tables, and “❌” rows that contradict the shipped code. Live LLM orchestrate remains an environment/credential validation gate, not an unimplemented architecture.

### Evidence

- `packages/server/src/domains/secrets/{service.ts,ports.ts,adapters/vault.ts}` and tests — Vault ports/resolvers.
- `packages/server/src/domains/integrations/{service.ts,adapters/nango.ts,routes/llm.ts,routes/comms.ts,routes/nango.ts}` and tests — BYOK/Nango integration.
- `packages/server/src/domains/notifications/` — current communications implementation.
- `packages/server/src/domains/webhooks/` — current inbound/outbound implementation.
- `packages/server/src/domains/agent/mastra/` and tests — executor/tools/mock path.
- `docs/2026-08-06/BUILD-MASTER-INDEX.md` line 16 explicitly warns readers to ignore stale unchecked boxes in this roadmap and use the bottom checklist.
- History: `303c554`, `aa1899e`, `e581017`, `fd34930`, `c3de5a5`, `5996ad1`.

### Stale claims

- Lines 25 and multiple phase sections say webhooks, machines, notifications, and agent integrations are future or minimally wired while the implementation checklist and current source show them shipped.
- The notifications “Shipped” and “Shipped (template system + multi-channel)” sections are incomplete relative to current provider webhooks/delivery analytics/compliance.
- The I-f section says v1 inbound only and defers outbound/admin UI, contradicting `packages/server/src/domains/webhooks/schema.ts`, `service.ts`, routes, outbound worker, and router.
- Older “❌” caller/feature tables and “when to build” guidance are no longer reliable.
- “Phase I + II (mock) shipped” is broadly right, but should explicitly distinguish implemented live code from the unvalidated live-LLM environment path.

### Required correction

Keep the dependency rationale and completed checklist, but mark all older phase-plan snapshots as historical, update the current status table, and link readers to `docs/2026-08-06/BUILD-MASTER-INDEX.md` for authoritative remaining work.

---

## 8. `docs/2026-08-04/PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md`

**Classification:** **stale-needs-correction**  
**Disposition:** **Correct** (it is a useful design/reference map, but its status must no longer imply no implementation).

### Factual implementation status

The placement decisions remain correct: ZITADEL for human identity, Keto for authorization, Vault for LLM/comms/org secrets, Nango for OAuth token lifecycle, Postgres for public config/CMS/preferences, and `domains/notifications` for platform communications. These components are implemented rather than merely an approved plan. The document’s architecture diagrams and org-vs-user separation remain useful.

### Evidence

- `packages/server/src/domains/secrets/service.ts`, `ports.ts`, `adapters/vault.ts` — Vault-backed secret ownership and resolvers.
- `packages/server/src/domains/integrations/service.ts` and routes — admin BYOK/Nango paths.
- `packages/server/src/domains/notifications/{service.ts,schema.ts,email-template.ts,marketing-compliance.ts}` — communications, CMS templates, preferences/delivery data, compliance.
- `packages/server/src/domains/webhooks/` — separate webhooks boundary.
- `packages/server/package.json` — Vault-integrated domain dependencies and React Email/SES dependencies.
- `docs/2026-08-06/BUILD-MASTER-INDEX.md` platform snapshot — Vault/integrations/comms shipped.

### Stale claims

- Lines 3–5 say “Approved plan (no implementation in this doc).” As a dated design doc this is understandable, but it is misleading when used as a current platform map.
- The phase tables and implementation order describe I-a through II as work to do, although the roadmap checklist and source show those phases largely delivered.
- Lines 174–188 still describe raw HTML as an allowed alternative, while current `notification_email` is spec-only and the email-template parser has no HTML fallback.
- The manual tenant setup checklist retains unchecked items that are implementation/ops status rather than a current completed-state report.

### Required correction

Change the status to “design reference; implementation shipped” and split the setup checklist into “implemented prerequisite” versus “operator action per tenant.” Remove or clearly label the raw-HTML alternative as historical migration context.

---

## 9. `docs/2026-08-04/SECRETS-RESOLVER-CACHE.md`

**Classification:** **current**  
**Disposition:** **Leave** (optionally update the date if the cache policy changes).

### Factual implementation status

The document accurately describes an optional process-local LLM resolver cache disabled by default, keyed by org/provider, with TTL expiry and org-wide invalidation when an LLM secret is written. Comms credentials are not cached by this service. The cache is not in Redis and is per process/replica.

### Evidence

- `packages/server/src/domains/secrets/service.ts` lines 18–59 — cache map, env-controlled TTL, key, expiry, invalidation.
- `packages/server/src/domains/secrets/service.ts` lines 117–155 — cache use in `resolveLlmApiKey`.
- `packages/server/src/domains/secrets/service.ts` lines 163–201 — uncached comms resolution.
- `packages/server/src/domains/secrets/service.test.ts` — resolver behavior and fallback coverage.
- `packages/server/src/domains/agent/mastra/resolve-planner-model.ts` — live planner consumer.

### Stale claims / limitations

No material stale implementation claim was found. The Noti/Ristretto comparison is explicitly reference material. The “do not enable in prod until ops batch validates live paths” sentence is an operational caution, not a claim that the code is absent.

### Required handling

Leave. If operational policy changes, update the TTL/production-gate wording; no source correction is indicated by this audit.

---

## 10. `docs/2026-08-04/VAULT-CLIENT-SECRETS.md`

**Classification:** **stale-needs-correction**  
**Disposition:** **Correct** (retain as security/design reference).

### Factual implementation status

The one-secret/one-home model is current. Vault-backed org/platform secret storage, server-only access, public Postgres flags, and Nango connection pointers are implemented. The document is no longer merely an approved build plan. Resolver behavior also supports the current platform fallback paths and the broader comms provider set.

### Evidence

- `packages/server/src/domains/secrets/{ports.ts,service.ts,adapters/vault.ts,index.ts}` and tests.
- `packages/server/src/domains/integrations/{service.ts,routes/llm.ts,routes/comms.ts,routes/nango.ts}` and tests.
- `packages/server/src/domains/notifications/outbound.ts` and `service.ts` — notifications consume `resolveCommsCredentials` rather than Vault SDK.
- `packages/server/src/domains/agent/mastra/resolve-planner-model.ts` — agent LLM resolution through the secrets port.
- `docs/2026-08-06/BUILD-MASTER-INDEX.md` line 25 — Vault/integrations/OAuth shipped.

### Stale claims

- The status line says “Approved plan” and points to a build order that has since been executed.
- Phase plan rows I-a/I-b/I-c/I-d/II are written as future implementation work.
- The resolver table names only Resend/Twilio-style fallback while `CommsProviderName` and the email adapter registry now include SES, SendGrid, Mailgun, Postmark, and Brevo.
- The diagram and FAQ use “Phase 2” language for Nango despite current Nango integration code.

### Required correction

Retain the secret-placement and security rules, update status to implemented, refresh provider examples and phase labels, and distinguish per-tenant onboarding actions from engineering work.

---

## 11. `docs/2026-08-04/WEBHOOKS-DOMAIN-SPEC.md`

**Classification:** **stale-needs-correction**  
**Disposition:** **Correct**.

### Factual implementation status

The domain boundary and inbound verification/idempotency model are valid. Current code also implements outbound subscriptions, Vault-held signing secrets, queued retries, delivery listing/retry, admin routes, and event-router fan-out. The spec’s header correctly says inbound + outbound + admin shipped, but its body still contains the original inbound-only plan.

### Evidence

- `packages/server/src/domains/webhooks/schema.ts` — subscriptions and outbound delivery tables.
- `packages/server/src/domains/webhooks/service.ts` — HTTPS validation, secret storage, subscription CRUD, fan-out, retries.
- `packages/server/src/domains/webhooks/routes/inbound.ts`, `routes/subscriptions.ts` — inbound/admin APIs.
- `packages/server/src/domains/webhooks/outbound-worker.ts`, `outbound-router.ts`, `index.ts` — worker and platform-event routing.
- `packages/server/src/domains/webhooks/service.test.ts`, `packages/server/src/domains/integrations/provider-event-receipts.test.ts` — webhook/provider-event coverage.
- `docs/2026-08-06/BUILD-MASTER-INDEX.md` lines 26–28 — webhooks shipped inbound + outbound.

### Stale claims

- Lines 15–21 mark business inbound and outbound as not implemented, despite the status header and current source.
- Lines 58–69 call v1 inbound-only and defer outbound subscriptions/admin UI, directly contradicted by current schema/routes/service/worker.
- The proposed v1.1 tables and checklist are now implemented; they should be moved into a shipped section.
- The event-bus section describes a log-only stub, while `outbound-router.ts` subscribes to machine, comms, and agent completion events.
- The edge/public-access wording should be checked against current route registration; it is a security-sensitive implementation detail and should not remain only as an old proposal.

### Required correction

Make the implemented inbound/outbound/admin behavior the main spec, retain the original v1/v1.1 plan as dated history, and update event routing and provider-event boundaries to current code.

---

## 12. `docs/2026-08-04/WEBHOOKS-PLATFORM-RFC.md`

**Classification:** **stale-needs-correction**  
**Disposition:** **Correct**; retain as a design/reference RFC.

### Factual implementation status

The fixed decision to build in-house and use Svix/Hookdeck as reference is current. Inbound and outbound platform code exists, including subscription/delivery models, signed outbound envelopes, retries, admin operations, and event routing. The RFC remains useful for ecosystem comparison, but its feature matrix and phased roadmap retain pre-shipping targets.

### Evidence

- `packages/server/src/domains/webhooks/{schema.ts,service.ts,envelope.ts,outbound-worker.ts,outbound-router.ts}`.
- `packages/server/src/domains/webhooks/routes/{inbound.ts,subscriptions.ts}` and `service.test.ts`.
- `packages/server/src/domains/secrets/service.ts` and webhooks service — signing secrets are stored through the secrets port.
- `docs/2026-08-06/BUILD-MASTER-INDEX.md` webhooks snapshot and remaining-work sections.
- History: `e581017`, `5996ad1`, `49a28aa`, `5c938ac`.

### Stale claims

- The matrix’s “noname target” column lists outbound subscriptions, delivery attempts, manual retry, auto-disable, and portal as targets even though a substantial subset is shipped; the current code should determine the exact remaining subset.
- The roadmap lines 277–290 labels I-f.1–I-f.4 as future, conflicting with the current status header and implementation.
- The “proposed stable port” section is now an implemented port/domain, not merely proposed.
- Open questions such as whether to commit to Standard Webhooks headers should be reconciled with `packages/server/src/domains/webhooks/envelope.ts` and the outbound worker.

### Required correction

Keep the research/matrix and explicit non-dependency decision, but add a shipped-state column/date and reclassify only actual future capabilities (filters, replay, self-service portal, queue destinations, or health automation if still absent) as roadmap items.

---

## 13. `docs/2026-08-04/WEBHOOKS-VS-SVIX-HOOKDECK.md`

**Classification:** **historical**  
**Disposition:** **Leave and mark historical/superseded**.

### Factual implementation status

This is an explicit pointer document: it says it is superseded by `WEBHOOKS-PLATFORM-RFC.md`, links the implementation spec and roadmap, and correctly says Svix/Outpost are not runtime dependencies. It is not intended to be a current implementation inventory.

### Evidence

- The document itself, lines 3–12, explicitly declares supersession and points to the living RFC/spec.
- `docs/2026-08-04/WEBHOOKS-PLATFORM-RFC.md` — replacement research/RFC.
- `packages/server/src/domains/webhooks/` — current implementation referenced by the replacement docs.

### Stale claims / limitations

No material stale claim beyond its intentionally minimal historical role. Its “quick links” do not need to enumerate current source files because it is a superseded pointer.

### Required handling

Leave unchanged; retain the superseded marker. If the directory is eventually reorganized, this can be archived, but it should not be treated as the living webhook RFC.

---

## 14. `docs/2026-08-05/BUILD-MASTER-INDEX.md`

**Classification:** **historical**  
**Disposition:** **Leave and mark historical** (the file already contains the move notice).

### Factual implementation status

This file is a redirect stub, not a build-status source. It accurately states that the index moved on 2026-08-06 to `docs/2026-08-06/BUILD-MASTER-INDEX.md` and directs readers to that folder’s README. The destination exists and is the current canonical entry point.

### Evidence

- `docs/2026-08-05/BUILD-MASTER-INDEX.md` lines 1–5 — explicit move notice.
- `docs/2026-08-06/BUILD-MASTER-INDEX.md` — canonical current index and platform snapshot.
- `docs/2026-08-06/README.md` — current folder start page and previous-index pointer.
- History: `5996ad1` and subsequent 2026-08-06 documentation updates.

### Stale claims / limitations

The title “Build master index” could mislead readers who overlook “moved,” but the body is factually clear. Its historical date/location is intentional.

### Required handling

Leave unchanged; the existing redirect is the correct disposition. Do not duplicate or fork the current index under the assigned path.

---

## Summary

| Classification | Count | Documents |
|---|---:|---|
| Current | 2 | `AGENT-ORCHESTRATE-DEMO.md`; `SECRETS-RESOLVER-CACHE.md` |
| Historical | 3 | `E2E-OPS-BATCH-VALIDATION.md`; `WEBHOOKS-VS-SVIX-HOOKDECK.md`; `../2026-08-05/BUILD-MASTER-INDEX.md` |
| Design-reference | 0 | — |
| Stale-needs-correction | 9 | `COMMS-DELIVERY-ANALYTICS.md`; `COMMUNICATIONS-PLATFORM-RFC.md`; `EMAIL-TEMPLATES-REACT-EMAIL.md`; `IN-APP-INBOX-SSE.md`; `INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`; `PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md`; `VAULT-CLIENT-SECRETS.md`; `WEBHOOKS-DOMAIN-SPEC.md`; `WEBHOOKS-PLATFORM-RFC.md` |
| Unclear | 0 | — |
| **Total** | **14** | Every Markdown file under both assigned directories |

No existing documentation or source was modified as part of this audit; only this report was written.
