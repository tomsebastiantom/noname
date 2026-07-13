# Agent Domain

## Purpose

The agent domain is the platform's **public API for the master-agent framework**. Any authenticated user — store owners, admins, platform operators — can create tasks, approve/reject agent outputs, and trigger work on the platform through standard HTTP endpoints.

It is NOT a CLI developer tool. The CLI (`@noname/cli`) handles project scaffolding and local dev commands. The agent domain is a server-side bounded context, exposed as REST routes under `/api/agents/`, that acts as the control plane for AI-driven platform operations.

## Architecture

The agent domain follows the same Domain-Driven Design pattern as all other bounded contexts in `packages/server/src/domains/`:

```
packages/server/src/domains/agent/
├── api.ts          # Hono route handlers (POST /tasks, GET /tasks, approve/reject)
├── ports.ts        # Storage interface (Postgres: tasks table)
├── entity.ts       # AgentTask aggregate root (extends AggregateRoot)
├── service.ts      # Business logic (create task, enqueue to BullMQ, approve, reject)
├── events.ts       # Event constants (task.created, task.completed, task.approved, task.rejected)
└── adapters/       # Storage adapters (Postgres, eventually in-memory for tests)
```

### Current State (Scaffolding)

| File | Status | What exists |
|------|--------|-------------|
| `api.ts` | Stub | Routes defined: `POST /tasks`, `GET /tasks`, `PUT /tasks/:id/approve`, `PUT /tasks/:id/reject` |
| Remaining files | Not yet created | ports, entity, service, events, adapters |

### Target Architecture (Per Build Plan)

From `docs/2026-05-23/BUILD_PLAN.md`, Domain 5 — AI Agent Manager:

```
POST /api/agents/tasks     → Merchant assigns task
                             → BullMQ enqueue
                             → Worker picks up
                             → LLM call
                             → Result stored in Postgres

GET /api/agents/tasks       → List tasks (by store, status, assignee)

PUT /api/agents/tasks/:id/approve → Human reviews diff → Approves → Published + cached
PUT /api/agents/tasks/:id/reject  → Human reviews diff → Rejects → Feedback loop
```

### Key Design Decisions

1. **Public API, not CLI tool.** The agent domain exposes endpoints so any authenticated user can manage agent tasks. The CLI is a separate developer utility.

2. **Human-in-the-loop by default.** No agent action is published without approval. The permission model (from BUILD_PLAN):
   - Read-only analysis → auto-execute
   - Draft generation → requires approval
   - Publishing/deletion → permanently denied

3. **BullMQ-backed task queue.** Tasks are durable, async, and never block the request path. Workers pick up jobs, call LLMs, and store results.

   **Why BullMQ is necessary:**

   LLM calls are slow — seconds to minutes per generation. Blocking an HTTP request for that duration is unacceptable:
   - The client connection would time out (browsers, proxies, load balancers all have timeouts)
   - The server thread is tied up waiting on I/O, reducing capacity for other requests
   - No retry mechanism — if the LLM call fails mid-request, the task is lost with no recovery
   - No visibility — the caller has no way to check progress without a durable task record

   BullMQ solves all of this:
   ```
   Without queue:
     POST /api/agents/tasks → wait 30s for LLM → response (or timeout)

   With BullMQ:
     POST /api/agents/tasks → create task + enqueue → 201 in <100ms
     Worker picks up job → LLM call → store result → update task status
     GET /api/agents/tasks/:id → check status (pending → running → completed/failed)
   ```
   - **Non-blocking**: API returns immediately. Task executes asynchronously.
   - **Durable**: Jobs survive server restarts (Redis-backed). No lost tasks.
   - **Retryable**: Failed LLM calls can be retried with backoff. Transient errors recover.
   - **Observable**: Task state (pending/running/completed/failed) is stored in Postgres. Merchant polls or gets notified.
   - **Scalable**: Multiple workers can consume jobs in parallel. Rate-limiting per store, per LLM provider.
   - **Overflow handling**: Queue depth acts as a buffer. Spikes in task creation don't crash the server.

   Same pattern applies across the platform: analytics event ingestion, video transcoding, email dispatch. BullMQ is the standard async execution layer for any domain with slow or unreliable side effects.

4. **Shareable primitives.** Uses `src/shared/` cross-cutting layer:
   - `AggregateRoot` for domain events (task.created, task.approved)
   - `eventBus` for cross-domain communication (analytics domain listens for task lifecycle events)
   - `DomainError` for typed errors

5. **Coupled to content/documents domains.** Agent outputs are typically layout templates (documents domain, `layout` type) or content entries (content type). The agent domain orchestrates generation; the target domain handles storage and publishing.

## Cross-Domain Integration

| Event published | Subscribed by | Purpose |
|----------------|---------------|---------|
| `task.created` | analytics domain | Track task creation volume per store |
| `task.completed` | (future) notification domain | Alert merchant when task is done |
| `task.approved` | spec/content domain | Publish approved output to live |
| `task.rejected` | (future) feedback loop | Train ML on rejection patterns |

## API Surface (Current Stubs)

```
POST   /api/agents/tasks            → Create a new agent task
GET    /api/agents/tasks            → List tasks (query: storeId, status, assignee)
PUT    /api/agents/tasks/:id/approve → Approve agent output
PUT    /api/agents/tasks/:id/reject  → Reject agent output with feedback
```

## Next Steps

1. Define `AgentTask` entity extending `AggregateRoot`
2. Define `ports.ts` with `AgentTaskStorage` interface
3. Implement `service.ts` with create/list/approve/reject business logic
4. Wire BullMQ for async task execution
5. Add Postgres adapter for task persistence
6. Publish domain events for cross-domain subscribers