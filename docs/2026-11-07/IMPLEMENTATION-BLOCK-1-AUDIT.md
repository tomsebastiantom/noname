# Implementation block — fix release audit, then the operator boundary

> **Status:** **steps 1–4 of the sequence implemented and verified 2026-11-07** — release audit fix,
> request-id + AUDIT_READ, platform accounts/guard/dry-run, and eval on per-tenant service accounts.
> **Why this block:** the release control plane is built, but release moves still write **business records** with
> `data.actor`. That is the earlier mistake. It is fixed **before** anything else is tested or the platform
> operator is introduced.
> **Related:** [`CONTROL-PLANE-IMPLEMENTATION.md`](./CONTROL-PLANE-IMPLEMENTATION.md) · [`PLATFORM-OPERATOR-DESIGN.md`](./PLATFORM-OPERATOR-DESIGN.md) · [`AUDIT-SCOPE.md`](./AUDIT-SCOPE.md)

---

## 1. The mistake being fixed

Today, three release services write a business record:

```ts
evidence.appendRecord({
  type: "platform.release.tenant_promoted",
  data: { from, to, actor },
});
```

Wrong plane: the actor is buried in `data`, the row is not queryable by actor, and release information ends up in
the business-fact table. The correct primitive is `evidence.audit`.

| File | Current | After |
|---|---|---|
| `domains/release/pointer-service.ts` | `appendRecord` `platform.release.tenant_promoted` | `audit` `platform.release.tenant_promoted` |
| `domains/release/environment-service.ts` | `appendRecord` `platform.release.switched` | `audit` `platform.release.environment_switched` |
| `domains/release/channel-service.ts` | `appendRecord` `platform.release.channel_promoted` | `audit` `platform.release.channel_promoted` |

**No record is written for release moves.** Existing historical rows stay (append-only); no backfill, no rewrite,
no delete.

## 2. Audit shape

```ts
await evidence.audit({
  orgId,                                  // affected tenant (platform org for global actions)
  action: "platform.release.tenant_promoted",
  actorType: "user",                      // "system" when actor === "system"; "service" for the operator later
  actorId: actor,
  subjectType: "tenant.storefront",
  subjectId: orgId,
  reason: waveId,                          // optional
  metadata: { from, to, releaseId, channel?, environment?, requestId? },
  correlationId: waveId ?? `${orgId}:${to}`,
  idempotencyKey: `${action}:${orgId}:${to}`,
});
```

- `org_id` is the affected tenant (or `PLATFORM_ORG_ID` for global actions) — see `AUDIT-SCOPE.md`.
- No release artifacts, digests or config in the row; only references.
- `requestId` is optional until the middleware lands; then it is always present.

**Actor type limitation (recorded):** the service signatures currently pass an `actor` string. Until the
service-account token is live, map `actor === "system"` to `system`, everything else to `user`. The platform
operator will pass `service` explicitly when its guard lands.

## 3. Tests for the fix

| Level | Test |
|---|---|
| unit — pointer | promote calls `audit` once with action/actor/from/to; **no** `appendRecord` |
| unit — pointer | rollback calls `audit` with `rollback: true` |
| unit — environment | switch writes one audit row; no record |
| unit — channel | channel move writes one audit row; no record |
| unit — no-op | promoting the same release twice writes no second audit row |
| integration | `evidence_audit_events` has the row; `evidence_records` has **no** new release row |
| regression | tenant admin promote still works (own org) |

## 3a. Part 1 evidence (2026-11-07)

| Check | Result |
|---|---|
| Unit | **50/50** release-domain tests (7 pointer + 8 environment + 5 channel + 7 release + 15 classifier + 4 migration policy + 4 retention) |
| Full suite | **639/639**, 143 files |
| Typecheck | clean |
| Live promote | `evidence_records` count stayed **16** (no new release record); `evidence_audit_events` count **1** |
| Audit row | `platform.release.tenant_promoted`, `actor_type=user`, `actor_id=admin@…`, `subject=tenant.storefront`, `from/to` correct |
| Live rollback | `platform.release.tenant_rolled_back` row written |
| Historical | 16 legacy records untouched; no backfill, no delete |

**Limit recorded:** actor type is `user`/`system` until the platform operator passes `service`; that lands with the
guard. `requestId` in metadata waits for the middleware (part 2).

## 3b. Part 2 evidence — request id + AUDIT_READ (2026-11-07)

| Check | Result |
|---|---|
| Unit | **54/54** targeted (request-id 3, pointer 8, release domain rest) |
| Full suite | **643/643**, 144 files |
| Typecheck | clean |
| Live response | promote response carried `x-request-id: req-live-12345678` |
| Audit metadata | `metadata->>'requestId' = req-live-12345678` on the promotion row |
| Tenant audit | `GET /api/evidence/audit` with `audit:read` → **200**, 3 rows |
| Without permission | same route with `machines:read` → **403** |
| Permission gate | `/audit` uses `auditPermission: AUDIT_READ`; release subjects map to it |

**Note:** `/audit` uses `requireActorPermission`, so an explicit machine token with `audit:read` can read (useful for
export); a token without it is 403. The tenant admin gets `AUDIT_READ` through `admin`.

## 4. Then (not in this first commit)

1. `x-request-id` middleware + `requestId`/`traceId` in audit metadata.
2. `AUDIT_READ` permission and tenant audit route mapping.
3. Platform org + `platform_operator` role + service account + private key (init).
4. `requirePlatformOperator` guard (JWKS, `PLATFORM_ORG_ID`, permission) + dry-run `POST /:id/rollout`.
5. ZITADEL credential-lifecycle audit.

## 5. Commit plan

| Commit | Contents |
|---|---|
| **1** | `feat(release): write release moves as audit events, not business records` — three services + tests |
| **2** | `docs: record the verified release audit fix` — verification log + plan status |
| **3** | (next block) `feat(release): add request id and tenant audit read` |
| **4** | (next block) `feat(release): provision platform operator and dry-run rollout` |

Each commit is independently revertible; no schema migration in commit 1.

## 6. Verification for commit 1

1. `pnpm --filter @noname/server typecheck`
2. `pnpm vitest run packages/server/src/domains/release`
3. Full server suite.
4. Live: promote a release, then
   - `select count(*) from evidence_records where type like 'platform.release.%'` → unchanged (0 new),
   - `select action, actor_id, data->>'from', data->>'to' from evidence_audit_events where action='platform.release.tenant_promoted' order by recorded_at desc limit 1` → one row.
5. Rollback: same check for `platform.release.rolled_back`.

## 7. Risks

| Risk | Mitigation |
|---|---|
| losing historical release records | none are deleted; new rows are audit |
| consumers reading `evidence_records` for release events | there is no such consumer today; audit is the new read path |
| actor type wrong until guard lands | documented; `system` vs `user` now, `service` later |
| audit write fails after the pointer write | visible failure; outbox is the follow-up (recorded limitation) |
| two writes (record + audit) during transition | **forbidden** — the record write is removed in the same commit |
