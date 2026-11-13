# Platform audit stream and NDJSON export (step 7)

> **Status:** **implemented and verified 2026-11-12** · **Scope:** roadmap step 7. Cross-org audit query and NDJSON
> export behind `PLATFORM_AUDIT_READ`.
> **Related:** [`WAVE-WRITE-PATH.md`](./WAVE-WRITE-PATH.md) · [`../2026-11-07/AUDIT-LOGGING-DESIGN.md`](../2026-11-07/AUDIT-LOGGING-DESIGN.md)

---

## 1. Why this exists

Tenant audit answers “what happened to **my** store”. A wave is the opposite question: **what did the operator do
across tenants**. Before this step the audit rows written by a wave existed but were only readable per org, so no one
could review a multi-tenant promotion as a single stream.

## 2. Surface

```
GET /api/platform/audit
  ?orgId= &action= &actorType= &actorId= &subjectType= &subjectId=
  &from= &to= &limit= (1..1000) &format=json|ndjson
```

| Behaviour | Detail |
|---|---|
| JSON (default) | `{ count, events }`, newest first |
| `format=ndjson` | one JSON object per line, `application/x-ndjson`, `content-disposition: attachment; …` |
| Filters | all optional; every applied condition is an indexable equality except the time range |
| Cap | `limit` ≤ 1000, default 200 |

The NDJSON body contains **only** events — no wrapper, no trailing summary. A summary line would corrupt SIEM
ingestion, which is the whole point of the format.

## 3. Three independent guards

1. `requirePlatformOperator` — caller must be in `PLATFORM_ORG_ID` with the `platform_operator` role, resolved
   server-side from ZITADEL grants.
2. `PLATFORM_AUDIT_READ` — checked against the operator's permission set. `platform_operator` now holds it; **no
   tenant role does**, and `PLATFORM_ONLY_PERMISSIONS` keeps it out of tenant expansion.
3. The store method `listAuditAcross` is only reachable from this route. Tenant routes keep using
   `listAudit(orgId, …)`, which always binds an org.

## 4. Verification

Unit — `evidence/platform-audit.test.ts` (4 tests): filters reach the service; NDJSON emits one line per event with
the right content type; a caller without `PLATFORM_AUDIT_READ` gets 403; an invalid date is a 400.

Live — platform service-account token:

```
GET /api/platform/audit?action=platform.release.tenant_promoted   → 200, count=2
GET /api/platform/audit?orgId=222000333                           → 200, count=1
GET /api/platform/audit?format=ndjson                             → 200
    content-type: application/x-ndjson; charset=utf-8
    content-disposition: attachment; filename="platform-audit-2026-11-13.ndjson"
    2 lines, first line:
      {"id":"231152b6-…","orgId":"222000333","action":"platform.release.tenant_promoted",
       "actorType":"service","actorId":"399364357571477570",…}
```

Tenant-scoped credential against the same route → **401/403** (never a cross-org read).

Suites: `evidence` + `@noname/auth` → **57/57**; typecheck clean.

## 5. Limits

- **No pagination cursor.** `limit` + time filters are the only windowing; a large export must page by `from`/`to`.
- **No integrity chain.** Rows are individually recorded but not chained/hashed, so tampering inside Postgres is
  detectable only by comparison with an external copy. That is the audit evidence pack (roadmap step 10).
- **No retention policy applied** here; the table grows.
- **Export is synchronous** — a very large range is bounded by `limit`, not streamed from the DB.
- Access logs (HTTP request records) are still not implemented; this stream is authority/access **events**, not
  requests.

## 6. Next

Step 8 — record the three open decisions (B7 visual rubric, D9 `unverified` policy, D5/E20 checkout), so the gate
semantics that steps 5–6 currently assume are written down rather than inferred from code.
