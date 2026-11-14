# RFC — Schedules (timers, job status, operator control)

> **Status:** **proposal** · **Date:** 2026-11-14
> **Owner:** platform
> **Related:** [`IMPLEMENTATION-ROADMAP.md`](../2026-11-07/IMPLEMENTATION-ROADMAP.md) ·
> [`TENANT-PROVISIONING-RFC.md`](./TENANT-PROVISIONING-RFC.md) · [`PLATFORM-CONSOLE.md`](./PLATFORM-CONSOLE.md)

---

## 1. Problem

The platform has queues but **no notion of time**. Every job today is triggered by a request; nothing happens because
an hour or a month passed.

Two things already need it:

- **retention** — tenants soft-deleted (`status=deleted`) must be purged after a window, not "when someone remembers";
- **provisioning steps** — currently a detached promise: it runs while the request is alive and is lost if the process
  stops. That is the same gap from the other direction (work that must happen later or again).

And every platform grows more: evidence retention, release GC, key-rotation reminders, digests, dunning.

The question this RFC answers is not "which scheduler library" — it is **what shape does scheduled work take on this
platform**, so the tenth job costs one file instead of a new subsystem.

## 2. What already exists

| Mechanism | Used for | Gap |
|---|---|---|
| **BullMQ queues** (Dragonfly/Redis) | analytics, agent tasks, catalog builds, email, webhooks, extension delivery, provider events, eval | no repeatable schedules registered anywhere |
| **`transition-relay`** | re-publishes events written in the same transaction as a state change | proves the outbox idea, no timer |
| **`webhook_outbound_deliveries`** | persisted intent + retries | proves delivery state, no timer |
| **`worker.ts` + `RUN_WORKERS` gate** | separates job processing from request handling | no schedule registry |

So the infrastructure for *running* work exists and is proven. What is missing is **declaration and observation**:
"what runs at 03:00?" and "did it run?" have no answer today.

## 3. Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | **Definitions live in code** (`domains/schedules/definitions.ts`) | a schedule is behaviour; behaviour is reviewed in a PR, and cannot drift from its handler |
| 2 | **A definition without a handler is logged and skipped**, shown as `unavailable` | one misconfigured schedule must not stop tenant traffic; silence would be the dangerous failure |
| 3 | Operators may change **pause, pattern, dry-run** at runtime | stopping a job for a weekend or moving it to 04:00 should not need a deploy |
| 4 | **"Run now" refuses while paused** | "paused" means "not now"; forcing is a separate, explicit act |
| 5 | New schedules default to **dry-run on** | a schedule must not be able to destroy data merely by being deployed |
| 6 | **One queue** `{platform-schedules}`, `jobId = name` | duplicate registration across replicas collapses to one schedule |
| 7 | Runs are recorded in `schedule_runs`; API returns the last N | the history is the product: silence and failure must both be visible |
| 8 | Handlers are **injected**, not imported by this domain | the domain that owns behaviour owns the handler; this one only runs and records |
| 9 | Console surface is a **section in the existing platform panel** | no new route, template, or page for one table |
| 10 | **Definitions are code; schedules are data.** An operator may create any number of schedules **for an existing definition** (pattern, pause, dry-run), never a new capability | a schedule can only point at behaviour someone wrote and reviewed |
| 11 | **One domain, two producers** — platform (code-defined) and, later, tenant-authored instances | same concept, same runner, same history; splitting by author would duplicate the mechanism |

## 4. Design

```
code                          database                          queue
definitions.ts                schedules                         {platform-schedules}
  name (capability)             id                                one repeatable job per
  description                   definition → must exist in code   schedule id
  handler                       pattern
  defaultPattern                paused
  dryRunDefault                 dry_run
                              schedule_runs
                                schedule_id, definition, startedAt,
                                finishedAt, status, items, dryRun, error
```

Three nouns, three questions:

| Noun | Question it answers | Where |
|---|---|---|
| **definition** | *what can the platform do?* | code — reviewed, never created at runtime |
| **schedule** | *when, and how often?* | data — an instance of a definition; many allowed |
| **run** | *what happened last time?* | data — one row per attempt |

Same split as a Kubernetes `CronJob`: the controller knows what a job is, the object says when, the history says what
happened. Several `CronJob`s may reference the same workload — here, several schedules may reference the same
definition (e.g. retention at 03:00 daily, plus a weekly one with a longer window).

### 4.1 Execution path

```
startup        registerSchedules()
                 → ensure every definition has at least one schedule (create the default when none exists)
                 → for each schedule that is not paused and whose definition is available:
                     queue.upsertJobScheduler(`schedule:<id>`, { pattern }, { name: <id> })
due            BullMQ promotes the repeatable job
worker         schedules.execute(scheduleId)
                 → insert schedule_runs(status=running)
                 → handler({ dryRun })
                 → update status ok/failed + items + finishedAt
operator       POST /:id/run → same execute(), refusing when paused
operator       POST /        → create a schedule: { definition, pattern, label? }
                              rejects a definition that is not in code
```

The handler is `(ctx: { dryRun }) => Promise<{ items, dryRun }>` — deliberately tiny. A job that needs more will tell us
what the abstraction should be; inventing it now would be guessing.

### 4.2 The first definition

```ts
{
  name: "tenant-retention-purge",
  defaultPattern: "0 3 * * *",
  dryRunDefault: true,
}
```

The handler is injected from bootstrap, where the purge already lives, and does what the operator button does:

```
select tenants where status='deleted' and updated_at < now() - RETENTION_DAYS
for each: purge (existing path) → one platform.tenant.purged audit row
```

`dryRun` reports what *would* be purged and touches nothing. Turning it off is an explicit operator action
(`PUT /:id/dry-run`), recorded on the schedule row.

### 4.3 Why a sweep, not a per-tenant timer

The retention job asks **"what is due?"**, not "purge tenant X in 30 days". Consequences:

- a missed tick, a week of downtime, or a lost enqueue changes nothing — the next run finds everything overdue;
- no outbox is needed: the intent already exists as `status='deleted' + updated_at`;
- re-running is harmless (the purge refuses unless the tenant is `deleted`).

### 4.4 One domain, two producers

Per-item timers (publish a page at 09:00, remind user X) are **not** a separate subsystem. A domain is split by
concept, not by who calls it, and the concept is the same: *something must happen at a time, and its result must be
inspectable*.

What differs is only **where the definition lives**:

| | definition | instance |
|---|---|---|
| **platform schedule** | code (`definitions.ts`) | derived — one per definition |
| **tenant timer** | code (`actionKinds` — the allowed kinds) | a row the tenant created (`org_id`, `kind`, `run_at`, `payload`) |

In both cases **the handler is code**: a tenant chooses *when*, never *what runs*. That is what keeps this one domain
rather than a plugin system.

So today only the **code-defined producer** is implemented. The tenant-authored producer is the next one in the same
domain — same queue, same worker, same `schedule_runs`, same console section — and it adds only what is genuinely
per-instance: quota, tenant permission check, per-item retry, and (when it matters) creating the instance inside the
same transaction as the business row it depends on.

The one thing that stays separate is the **authoring surface**: platform schedules have no create endpoint (they are
code), tenant timers will have one, guarded and audited.

### 4.5 Scale — why the two producers do not compete

The two producers have different growth curves, and the runner treats them differently on purpose:

| Producer | Growth | Execution |
|---|---|---|
| platform schedules | O(number of platform features) — a handful | one **repeatable** job per name |
| tenant timers | O(tenants × timers) — potentially large | one **delayed** job per instance, claimed when due |

Consequences, stated so they are not discovered later:

- a tick of a platform sweep never looks at tenant timers, and a tenant's timer never delays retention;
- tenant timers must be claimed **per instance** (delayed job or `run_at` index + `FOR UPDATE SKIP LOCKED`), never
  by "select all timers" — that is the query that stops scaling first;
- per-tenant quota bounds a single noisy tenant without throttling the platform;
- if volume ever outgrows one queue, the split is by producer (two queues, same domain), not by feature.

### 4.6 Tenant data lives in one table, never one table per tenant

**Rule: a tenant is a column, not a table.** Verified against the current database: **44 tables** in `public` carry an
`org_id` column, and there are no tenant schemas (`public`, `drizzle` only). Every tenant-scoped feature — documents,
evidence, audiences, machines, flags, release pointers — follows it, with indexes that lead with `org_id`:

```
evidence_records_org_type_recorded_idx    (org_id, type, recorded_at)
evidence_records_org_subject_idx          (org_id, subject_type, subject_id)
```

Tenant timers follow the same rule: **one** `scheduled_actions` table (`id, org_id, kind, run_at, payload, status,
attempts, idempotency_key`), claimed through an index on `(org_id, run_at)` plus a partial index on
`status = 'pending'`.

Per-tenant tables were rejected because they multiply every cost and buy nothing:

| Cost | With one table per tenant |
|---|---|
| migrations | N schema changes per release |
| due-claim query | `UNION` over hundreds of tables, or N index scans |
| provisioning | creating a table becomes part of tenant creation |
| isolation | none gained — same disk, same planner, same pool |

Physical isolation (separate database per tenant) is a data-residency decision for a regulated deployment, not a
scaling technique, and it is not what this platform does.

## 5. API

```
GET    /api/platform/schedules               → { schedules: [{ id, definition, label, description, pattern,
                                                    paused, dryRun, available, lastRun }],
                                                  definitions: [{ name, description, defaultPattern }] }
POST   /api/platform/schedules               → { definition, pattern, label? } → new schedule
                                                400 when the definition is not in code
                                                409 when the pattern is not a 5-field cron
DELETE /api/platform/schedules/:id           → stops future runs; history is kept
POST   /api/platform/schedules/:id/run       → executes now (409 when paused)
POST   /api/platform/schedules/:id/pause
POST   /api/platform/schedules/:id/resume
PUT    /api/platform/schedules/:id/pattern   → { pattern }
PUT    /api/platform/schedules/:id/dry-run   → { dryRun }
GET    /api/platform/schedules/:id/runs      → history for that schedule
```

All routes require a platform operator; reads need `PLATFORM_AUDIT_READ`, changes need `RELEASES_PLATFORM_WRITE`.

Deleting a schedule stops future runs and keeps the past: a run that happened does not stop having happened because
someone tidied the list.

## 6. Console

A **Schedules** section in the existing platform panel (no new template):

| Column | Source |
|---|---|
| Definition + label | `schedules.definition` + definition description |
| Pattern, next run | schedule pattern + queue scheduler |
| Paused, dry-run | `schedules` |
| Last run (status, items, duration) | latest `schedule_runs` row for that schedule |
| Actions | **Run now**, **Pause/Resume**, edit pattern, **Delete** |

Above the table: **Create schedule** — a definition picker (each option shows the definition's short description) plus
a cron field. The picker can only offer what exists in code; there is no field for a handler, because a console cannot
invent behaviour.

It follows `spec-driven-ui`: a catalog component reading `$state`, actions in `core/actions/`, no `fetch` in the
component.

## 7. Failure modes, stated

| Failure | What happens | Why that is acceptable |
|---|---|---|
| Handler missing | schedule logged, shown `unavailable`, not registered | visible, and the API keeps serving |
| Handler throws | run row `failed` with the message; BullMQ retries per job policy | failure is recorded, not swallowed |
| Process dies mid-run | row stays `running`; `failStaleRuns` marks it failed after 6h | history does not claim work is still happening |
| Two replicas start | `upsertJobScheduler` dedupes on the scheduler key | cadence does not double |
| Redis wiped | schedules re-register at next start from code + state | no timer definitions live only in Redis |
| Paused schedule | removed from the queue, not fired-and-refused | no nightly noise in the history |

## 8. Alternatives considered

| Option | Why not (for now) |
|---|---|
| **Temporal** | correct tool when jobs become compensable sagas; for sweeps it adds a service, a database and an operator |
| **pg-boss** | would be a second queue mechanism beside BullMQ; its "atomicity" advantage matters only for per-item intents, which are out of scope |
| **Kubernetes CronJob** | cluster-level batch, separate lifecycle, needs an image; our workers run beside the API, not in the cluster |
| **Cloudflare Cron Triggers** | edge worker has no DB access; an HTTP trigger is not a scheduler |
| **`setInterval` / node-cron in the API** | dies with the process, duplicates per replica, no catch-up |

The deciding argument is not capability but **fewer mechanisms**: one queue system, one place where schedules are
declared, one history.

## 9. Rollout

1. migration for `schedules` + `schedule_runs`;
2. domain + queue + worker + routes (no behaviour change: no schedule is registered until a definition exists);
3. `tenant-retention-purge` registered **dry-run on** — it reports, it does not delete;
4. console section;
5. operator turns dry-run off deliberately, after seeing a dry run report.

## 10. Acceptance

- `GET /api/platform/schedules` lists the definition with `dryRun: true` and a last-run row after the first tick;
- a manual `POST /:name/run` creates exactly one `schedule_runs` row and one report line;
- with `dryRun: true` **no tenant row is removed** and no `platform.tenant.purged` row appears;
- with `dryRun: false` a soft-deleted tenant past the window is purged and audited;
- pause removes the scheduler; resume restores it; the console reflects both;
- a definition with a deliberately removed handler shows `available: false` and is not scheduled.

## 11. Open questions

1. **Catch-up policy** — a sweep is naturally catch-up-safe; do we also want an explicit "run all missed ticks" for
   future non-sweep jobs? Deferred until such a job exists.
2. **Per-schedule retry policy** — BullMQ defaults are used for now; a purge that fails on one tenant should continue
   with the rest rather than retry the whole sweep (the handler already loops per tenant).
3. **Provisioning on a queue** — the same infrastructure fixes the detached-promise weakness; it is a separate change
   because it alters request behaviour.
4. **Tenant-authored producer** — needs an `actionKinds` registry (what tenants may schedule), per-tenant quota,
   tenant-scoped permission, and per-item retry. It lands in **this** domain when a product feature needs it; the
   table shape is described in §4.4 so the migration can be additive.
5. **Scale limit** — platform schedules are O(number of features); tenant timers are O(tenants × timers). The runner
   must therefore never scan "all timers" per tick: platform schedules are repeatable jobs, tenant timers are delayed
   jobs claimed per instance. See §4.5.
