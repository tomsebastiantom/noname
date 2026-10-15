# Phase 0 Remediation — Status Handover

**Date:** 2026-10-12 (America/New_York)
**Scope:** `docs/2026-10-10/architecture-audit/07-REMEDIATION-ROADMAP.md` Phase 0, items 0.1–0.11
**Result:** 10 of 11 complete; 0.1 (secret rotation) is owner-deferred.

> **Correction (2026-10-15):** this header previously read "9 of 11 complete; 0.1 is owner-deferred,
> 0.4 is remaining." That was stale: 0.4 was completed on 2026-10-12 (§2, `e804b5c`) and the header
> was not updated with it. The mismatch is recorded here rather than silently overwritten, because a
> remediation record that contradicts itself is the same doc-reconciliation failure this audit exists
> to catch.

This is the handover record so the outstanding items can be picked up without re-deriving
context. Evidence is `file:line` plus commit; every claim was verified by running the code.

---

## 1. Completed

| # | Item | Commit | What changed |
|---|---|---|---|
| 0.5 | Delete the dead second HMAC verifier | `93b62da` | Removed `packages/server/src/shared/tenant.ts`. It was registered nowhere, only `console.warn`ed on a missing signature instead of rejecting, and read an `x-tenant-id` header the worker never sets. Its contract-test block was removed with it. |
| 0.7 | Graceful shutdown | `cee20da` | `packages/server/src/index.ts` now handles `SIGTERM`/`SIGINT`: stop accepting, drop long-lived SSE/WS connections, drain BullMQ, stop tracing, forced exit after `SHUTDOWN_TIMEOUT_MS`. Also explains `EADDRINUSE` and exits 1 instead of throwing. |
| 0.6 | ClickHouse must not gate boot | `21e4940` | `ensureClickHouseTable()` was awaited inside `createAnalyticsDomain`, which `createApp` awaits — so a ClickHouse outage crash-looped every API/worker replica. Now a background retry loop (`startClickHouseEnsure`), with readiness surfaced on `/health` as `analytics.{ready,attempts,lastError}`. `/health` still returns 200 (analytics is a sink, not replica liveness). |
| 0.8 | Durable analytics ingest | `ed2838f` | The worker buffered events in memory and returned before the write, so jobs were marked complete while data sat in RAM; the `catch` only recorded a span and the queue allowed `attempts: 1` — at-most-once. Now ingests inside the job and awaits it, lets errors propagate, and uses `attempts: 5` with exponential backoff. |
| 0.9 | Batch enqueue | `5447ca2` | `trackBatch` awaited one `queue.add` per event; now one `addBulk`. |
| 0.10 | Repo-root credential file | (filesystem only) | Deleted the gitignored repo-root `key` (2.8 KB) which contained a plaintext API token — the same value as `OPENAI_API_KEY` in `.env`. The earlier scratch logs and the stale `temp_inventory_fixture.sql` deletion were already handled. |
| 0.11 | Untrack harness state | `3405a38` | `.dsh/skills/*`, `kilo.json` (embedded an absolute machine path) and `.kilo/` untracked/ignored. Files remain on disk, so skills still load. |
| 0.2 | Close the forged-credential path | `a9799d0` | Two changes, see §3. |
| 0.3 | Regression test for the forged path | `4e48dc0` | Iterates `PUBLIC_ROUTES` and presents a forged admin token; `samplePathFor` throws on a pattern it cannot sample rather than skipping. |
| — | Reconcile the contradicting auth test | `2d49865` | `verified-token.test.ts` used the no-longer-trusted aggregate claim as the only role source for its positive controls. Repointed to the project-scoped claim and added a case asserting the aggregate claim alone grants nothing. |

### Verification performed

- `pnpm test` → **168 files, 699 tests, all passing**.
- `pnpm --filter @noname/{auth,workers,server} typecheck` → pass.
- **Falsification of 0.2:** reverting `packages/workers/src/routes/proxy.ts` to its pre-fix state makes the 0.3 test fail on **15 routes**; restoring it gives **31/31 passing**. The fix is load-bearing, not incidental.

---

## 2. Remaining

### 0.1 — rotate and purge `WORKER_SERVER_SECRET` (owner: you)

Still outstanding. `packages/workers/.dev.vars` is **tracked and still contains the live value**;
`docs/2026-07-13/AUTH.md` still contains it; there is no `.dev.vars` entry in `.gitignore` and no
`.dev.vars.example`; the value is present in HEAD so history is unpurged.

**This is the highest-value remaining item.** Both of the 0.2 layers (edge verification, and the
origin deriving identity only from HMAC headers) assume that secret is private. Anyone holding it can
mint valid `x-user-id`/`x-role` headers directly and bypass both.

### 0.4 — scope tenant reads at the data-access boundary (COMPLETE — 2026-10-12)

> **Status note (2026-10-15):** resolved by `e804b5c`. Everything from here to the "**Done (2026-10-12)**"
> paragraph below is the pre-fix analysis, kept as the record of what the hole was and how blast radius
> was measured — it is **not** a description of the current tree. The `:226` etc. line numbers in the
> block are from before the fix. Jump to "**Done (2026-10-12)**" for the verified end state.

At the time of writing, `packages/server/src/domains/documents/adapters/postgres.ts` exposed unscoped
reads/writes:

```text
:226 findDocumentById(id)
:230 updateDocument(id, data, meta, collectionId)
:243 publishDocument(id)
:270 archiveDocument(id)
:279 deleteDocument(id)
```

**The boundary currently holds**, so this is defence-in-depth rather than an open hole. Verified:

- `content.service.ts:79-83` (`findById`) and `:180-182` (`resolve`) compare `found.orgId !== orgId`
  and return `null` — cross-tenant ids are indistinguishable from missing, and it fails closed.
- `content.service.ts:90` routes writes through `requireContentEntry`.
- Spot-checked the non-service callers — all compare and fail closed:
  `collab/richtext-access.ts:27`, `collab/layout-access.ts:19`,
  `refs/resolve.ts:32`, `routes/document-ops.ts:33`.

**Why it is still worth doing:** the check lives at ~30 call sites by convention, so a new caller can
forget it. Pushing `orgId` into the SQL makes it unforgettable.

**Blast radius (measured):** 38 call sites across `documents`, `collab`, `auth`, and `agent`;
port declaration at `documents/ports.ts:348`; plus test fakes that implement the port
(e.g. `documents/refs/resolve.test.ts`, `agent/mastra/mock-orchestrate.ts`). Change shape: add
`orgId` as the first parameter to those five methods, filter with `and(eq(documents.orgId, orgId), …)`,
and keep the existing service-level checks as the second layer.

**Done (2026-10-12).** `orgId` is now the first parameter of all five methods
(`documents/ports.ts:348-367`) and every statement filters with
`and(eq(documents.orgId, orgId), eq(documents.id, id))`. 35 call sites across `documents`, `collab`,
`auth`, and `agent` were threaded; the compiler enumerated every one, so none could be missed.

The trap the compiler does **not** catch, and which is worth remembering for any future signature
change of this shape: a test fake written as `(id) => docs[id]` keeps compiling but silently receives
`orgId` as its first argument. Five such fakes existed and were rewritten to be org-aware, mirroring
the SQL, so the tests now exercise the real contract rather than a looser one.

Proven directly against Postgres, bypassing the service guards that already checked:

```text
read as owner            -> row
read as attacker org     -> null
attacker updateDocument  -> NotFoundError
attacker publishDocument -> NotFoundError
attacker archiveDocument -> NotFoundError
attacker deleteDocument  -> NotFoundError
owner doc afterwards     -> status=published, no injected field (nothing was mutated)
```

Live API confirmation on the same document: owner read `200`; cross-tenant read / resolve / update /
ops read all `404`.

---

## 3. What the forged-credential fix actually was

The audit chain (report 05 §7.3) required **two** conditions: an unverified token reaching a handler,
and that handler deriving identity from it.

**Layer 1 — edge (fixed, `proxy.ts:49` and `:181`).** The optional-auth routes were already
correct, but on **every other public route the edge forwarded the caller's raw `Authorization`
header to the origin — including all `/api/capabilities/*`**. Forwarding is now limited to
authenticated routes the edge just validated, plus `/api/auth/*`, which genuinely needs the caller's
own token. The regression test failed on 15 routes before this change.

**Layer 2 — origin (already present).** `capabilities/routes.ts:4` imports `getUserId` from
`shared/org` and `:41` derives `actorId` from it; the route never reads `Authorization`. Guarded by
`capabilities/routes.test.ts:206`.

Also removed: `rolesFromTokenPayload` accepted the aggregate
`urn:zitadel:iam:org:projects:roles` claim, whose role *names* span every project in the token — so a
role called `admin` in an unrelated project read as the platform `admin`. Now only project-scoped
claim keys are trusted (`packages/auth/src/jwt/roles.ts`).

---

## 4. Residual findings to track (not part of Phase 0, found while doing it)

1. **`roles.ts` dev fallback still scans across projects.** When the configured project id yields no
   roles, `rolesFromTokenPayload` falls back to scanning *any* `urn:zitadel:iam:org:project:*:roles`
   claim (documented as a local-dev accommodation for a stale `ZITADEL_PROJECT_ID`). Same class of
   cross-project role confusion as the claim 0.2 removed. It needs an explicit non-production gate
   (option or env) before any production claim.
2. **Un-seeded machine definition.** `machine_definitions` contains an `inventory_reservation` row
   inserted manually during Commerce verification rather than by the commerce seed. Fold it into the
   profile (see `docs/2026-10-10/RELEASE-VERIFICATION-STATUS.md`).
3. **`EADDRINUSE` fragility is only half fixed.** 0.7 makes the API fail loudly and drain on signals,
   but `tsx watch` still restarts on file save and can lose the port race when a previous listener has
   not exited. Any code edit can still drop the local API; the edge now survives an origin outage
   (`ead4f56`) rather than exiting 1.
4. **ADR-0012 documents the HMAC weakness but does not fix it.** No nonce/timestamp or `kid` in the
   HMAC payload, so captured headers replay indefinitely and the secret cannot be rotated without a
   lockstep redeploy. That is Phase 4 items 4.7/4.8, not Phase 0.
5. **Phase 1 is untouched.** CI (`1.1`), `architecture.test.ts` (`1.2`), `catalog-conventions.test.ts`
   (`1.3`), coverage widening (`1.5`), readiness metrics (`1.7`), retention jobs (`1.8`),
   `document_ops` unique index (`1.9`). `1.6` (boot-time env validation) partially landed via
   `packages/server/src/load-env.ts` from a parallel session — **verify** it declares all variables
   and fails fast on security-relevant ones before treating it as done.

Per the audit's own sequencing rule: **do not add a new architectural rule until Phase 1 enforcement
lands.**

---

## 5. References

- Audit: [`../2026-10-10/architecture-audit/07-REMEDIATION-ROADMAP.md`](../2026-10-10/architecture-audit/07-REMEDIATION-ROADMAP.md), [`05-SCALABILITY-SECURITY-RUNTIME.md`](../2026-10-10/architecture-audit/05-SCALABILITY-SECURITY-RUNTIME.md)
- Commerce status: [`../2026-10-10/RELEASE-VERIFICATION-STATUS.md`](../2026-10-10/RELEASE-VERIFICATION-STATUS.md)
- Checklist: [`../MANUAL-VERIFICATION-CHECKLIST.md`](../MANUAL-VERIFICATION-CHECKLIST.md)
