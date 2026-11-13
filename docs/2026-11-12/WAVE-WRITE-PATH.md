# Wave write path — one org, then batch (step 6)

> **Status:** **implemented and verified 2026-11-12** · **Scope:** roadmap step 6. `POST /api/releases/:id/rollout`
> now performs real promotions when `dryRun: false`, reports per-org results, and never rolls back a partial wave.
> **Related:** [`TENANT-DIRECTORY.md`](./TENANT-DIRECTORY.md) · [`GATE-VERDICT.md`](./GATE-VERDICT.md)

---

## 1. What changed

Before: `dryRun: false` returned `400 Write path is not enabled yet`. The endpoint could only plan.

Now: `dryRun` defaults to `true`; `false` promotes every **eligible** org. The eligibility gates from steps 4–5 run
first, in this order:

```
platform org          → skipped platform_org
unknown tenant        → skipped unknown_tenant
suspended/offboarding → skipped tenant_suspended / tenant_offboarding
excluded              → skipped tenant_excluded
already on release    → skipped already_on_release
verdict ≠ pass        → skipped verdict_blocked / verdict_unverified / no_verdict
otherwise             → promoted (or eligible in dry-run)
```

## 2. Response shape

```json
{
  "releaseId": "…",
  "dryRun": false,
  "summary": { "promoted": 1, "failed": 0, "skipped": 2, "eligible": 0 },
  "results": [
    { "orgId": "…", "status": "promoted" },
    { "orgId": "…", "status": "skipped", "reason": "verdict_blocked" },
    { "orgId": "…", "status": "failed", "error": "pointer write failed" }
  ]
}
```

## 3. Partial failure is reported, never hidden

A throw inside one org's promotion marks **that** row `failed` with its message and the loop continues. There is no
implicit rollback of the orgs that succeeded — a wave is a set of independent promotions, and silently undoing
earlier ones would be worse than reporting the partial result.

## 4. Two bugs found while enabling writes

**a) Platform releases could not be promoted at all.** `pointer.promote` resolved the release with
`releases.get(tenantOrg, id)`, so a release owned by the **platform** org came back `Release not found`. Fixed by
an explicit option: `promote(orgId, releaseId, actor, { platformOrgId })` performs a cross-org lookup **and verifies
the release is owned by that platform org**. Omitted → the original tenant-scoped rule. This is not a general
cross-org escape hatch: the caller must name the owner.

**b) Service promotions were attributed to a person.** The audit row used `actorType: "user"` because the pointer
service only receives an actor string. `promote` now accepts `actorType`, and the wave passes `"service"`.

### Regression tests for both

| Fix | Test |
|---|---|
| platform-owned release resolution | `pointer-service.test.ts` → “resolves the release across orgs when the platform org is named”, “refuses a release that belongs to a different org than the one named”, “keeps the tenant-scoped rule when no platform org is named” |
| platform vs tenant grant project | `auth/guards-grant-project.test.ts` → 5 cases: platform org → platform project; tenant org → tenant project; missing platform project; unset platform org; neither known |

The grant-project rule was extracted into `grantProjectIdForOrg(orgId, tenantProjectId, env)` precisely so it can be
tested without a token, a JWKS fetch, or a network call — the org→project mapping is the part that was wrong, and it
is pure.

## 5. Verification

Unit — `release/api.test.ts` (3 tests): dry-run writes nothing; a real wave promotes every eligible org; one
failing org does not stop the others and is reported as `failed`.

Live — release `f879eae7…` (`checksVersion=c`):

```
wave 1  orgIds: [yogastore, blocked-demo, noverdict-demo], dryRun: false
        promoted=1 failed=0 skipped=2
        yogastore      → promoted
        blocked-demo   → skipped verdict_blocked
        noverdict-demo → skipped no_verdict

wave 2  orgIds: [noverdict-demo], dryRun: false        (after a pass verdict was recorded)
        promoted=1
        noverdict-demo → promoted
```

Database evidence:

```
tenant_release_pointers
  398655937176469540 | f879eae7-… | 399364357571477570
  222000333          | f879eae7-… | 399364357571477570

evidence_audit_events (platform.release.tenant_promoted)
  222000333          | service | 399364357571477570
  398655937176469540 | user    | 399364357571477570   ← written before the actorType fix
```

Suites: `release` + `tenant-directory` → **70/70**; typecheck clean.

## 6. Limits

- **No acknowledgement path for `unverified`.** It is skipped, which is the conservative reading of D9. Until that
  decision is recorded and implemented, a tenant with one skipped required check can never be promoted.
- **No wave summary record.** Each org gets its own audit row; the roadmap also asks for one wave-summary row, which
  needs a wave id. Not implemented.
- **No queue.** A batch of 100 runs in-request; a large wave needs a background job and progress reporting.
- **No concurrency.** Orgs are promoted sequentially, which is correct for correctness but slow for a large wave.
- **Rollback is per org** (`POST /api/releases/pointer/rollback`), not a wave rollback.

## 7. Next

Step 7 — `GET /api/platform/audit` + NDJSON export behind `PLATFORM_AUDIT_READ`, so a cross-org wave is
queryable and exportable before more than one tenant is touched at scale.
