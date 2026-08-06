# Agent chat — what happens & how to investigate

> **Scope:** Editor Agent panel (right rail) + orchestrate tasks.  
> **Related:** [AGENT-ORCHESTRATE-DEMO.md](../2026-08-04/AGENT-ORCHESTRATE-DEMO.md), [E3e-AGENT-FULL-COLLAB-PEER.md](./E3e-AGENT-FULL-COLLAB-PEER.md)

## Summary

When you send a message in the visual editor Agent panel, the client creates an **orchestrate task** via HTTP, then **polls** the task row every ~800ms. There is **no WebSocket or SSE** from server to chat UI today — everything shown in the bubble comes from `GET /api/agents/tasks/:id`.

The actual work runs in a **BullMQ worker inside the API process** (`packages/server`, `pnpm dev`), not the Cloudflare edge worker on `:8787`.

---

## End-to-end flow

```
Editor Agent panel
  POST /api/agents/tasks          → insert agent_tasks (pending)
                                  → enqueue BullMQ job (+ OTEL trace context)
  poll GET /api/agents/tasks/:id  → read status, output, error (every 800ms)

Agent worker (same Node process as API)
  status → running
  Mastra executor:
    1. open layout collab session (if targetLayoutDocumentId + onBehalfOf)
    2. setProgressOutput (partial summary/steps while running)
    3. agent.generate (LLM planner + tools)
    4. complete or fail → update agent_tasks
  onTaskCompleted hook → optional notification email (if input.notify set)
```

### Key code paths

| Layer | Path |
|-------|------|
| Editor hook (poll, submit) | `packages/client/src/editor/hooks/use-editor-agent-panel.ts` |
| Chat UI | `packages/client/src/editor/components/agent/AgentPanel.tsx`, `AgentAssistantBubble.tsx` |
| API routes | `packages/server/src/domains/agent/routes/tasks.ts` |
| Queue + worker | `packages/server/src/domains/agent/service.ts`, `worker.ts` |
| Planner + tools | `packages/server/src/domains/agent/mastra/executor.ts` |
| Live collab join | `packages/server/src/domains/agent/collab/agent-layout-collab-session.ts` |
| Task persistence | `packages/server/src/domains/agent/adapters/postgres.ts` → `agent_tasks` |

---

## What the chat UI shows

| UI element | Data source |
|------------|-------------|
| Your message | Local React thread state (not a separate chat table) |
| Agent name | Registered agent label/slug |
| Status pill (Pending / Running / Failed / Done) | `task.status` |
| Summary text | `task.output.summary` |
| Collapsible tool steps | `task.output.steps[]` |
| Artifact chips | `task.output.artifacts[]` |
| Error text (e.g. `Assertion failed`) | `task.error` — **raw worker exception message** |
| Typing indicator | Client-only when pending/running and no summary yet |

**Not shown in chat:** trace IDs, server logs, LLM payloads, collab WS details, or a step-by-step event log.

---

## What gets persisted

| Store | Contents |
|-------|----------|
| `agent_tasks` | `prompt`, `input`, `status`, `output` (jsonb), `error`, `model`, `tokens`, audit columns |
| `document_ops` | Layout/content edits when agent tools run (`actorType=agent`, task id, `onBehalfOf`) |
| Domain events | `task.created`, `task.started`, `task.completed`, `task.failed`, … |
| Outbound webhooks | `agent.task.completed` (if subscribed) |
| Collab presence | Separate WS — agent appears in Live bar while collab session is open |

Partial progress while running: worker calls `AgentTask.setProgressOutput()` → `agent_tasks.output` updated before final completion (used for live summary/steps in UI).

---

## Observability

### OpenTelemetry → Jaeger

Tracing starts in `packages/server/src/tracing.ts`. Default OTLP endpoint: `http://localhost:4318/v1/traces`.

| Span | Attributes |
|------|------------|
| `agent.orchestrate` | `agent.task_id`, `agent.org_id`, `agent.type`, `agent.model`, `agent.tokens` |
| `agent.tool.<name>` | `agent.task_id`, `agent.tool.name`, `agent.tool.status`, `agent.tool.duration_ms` |

**Local Jaeger UI:** [http://localhost:16686](http://localhost:16686) (docker-compose service `jaeger`, ports `16686` + `4318`).

Search service **`noname-server`**, filter by `agent.task_id` or operation `agent.orchestrate`.

### Console logs (sparse)

Structured agent step logging to stdout is **minimal**. Known log lines:

- `[agent-collab] layout ticket refresh failed` — agent collab reconnect
- `[agent-collab] rich text ticket refresh failed`
- `[collab] snapshot persist failed`

Worker failures are recorded on OTEL spans (`span.recordException`) and stored in `agent_tasks.error`; they are **not always printed** to the terminal.

### Admin UI (best human-readable view)

**Admin → Agents → Tasks** — click **View** on a task.

- Polls every **2s** while `pending` / `running`
- Full summary, steps, artifacts, error
- Same API data as editor, easier to inspect

Path: `packages/client/src/admin/components/agents/AgentsAdminForm.tsx`

---

## How to debug a run

### 1. Note the task id

After sending a message, the task id equals the first API response id (also the thread entry id). Or grab it from Admin → Tasks.

### 2. Fetch task via API

```bash
curl -s "http://localhost:3000/api/agents/tasks/<TASK_ID>" \
  -H "Cookie: <session>" | jq .
```

Check: `status`, `error`, `output`, `model`, `updatedAt`.

### 3. Query Postgres

```sql
SELECT id, status, error, model, tokens, output, updated_at
FROM agent_tasks
ORDER BY created_at DESC
LIMIT 10;
```

### 4. Jaeger trace

Search spans with `agent.task_id = <TASK_ID>` on service `noname-server`.

### 5. Watch API terminal

Run `pnpm dev` in `packages/server` (or monorepo root). Submit a prompt and watch for `[agent-collab]` / `[collab]` lines.

### 6. Env flags (behavior changes)

| Variable | Effect |
|----------|--------|
| `MASTRA_ORCHESTRATE_MOCK=true` | Mock 7-step run, `model=mock-orchestrate`, no real LLM |
| `MASTRA_ORCHESTRATE_MOCK=false` | Live LLM — needs `OPENAI_API_KEY` or Vault BYOK |
| `AGENT_ORCHESTRATE_ENABLED=false` | Tasks fail immediately |
| `MASTRA_PLANNER_MODEL` | Default `openai/gpt-4o-mini` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | Default `http://localhost:4318/v1/traces` |

---

## Common symptoms

### `Failed` + `Assertion failed`

- **Meaning:** Raw exception message stored in `agent_tasks.error` and shown in chat.
- **Likely causes:** Automerge WASM error during layout collab apply; LLM/credential failure with opaque message; invalid spec merge.
- **Check:** `model` on task (mock vs live), Jaeger trace, `[agent-collab]` logs, whether API was restarted mid-run (collab WS broken).

### Live bar shows **Agents (2)** with same name

- **Meaning:** Two collab **presence peers**, not two registered agents.
- **Likely cause:** Agent collab ticket refresh (~45s) opens a new WS before the old peer is removed from `layout-room` peerMeta.
- **Code:** `packages/server/src/domains/agent/collab/agent-layout-collab-session.ts` (`scheduleCollabTicketRefresh`), `packages/server/src/domains/collab/layout-room.ts` (`joinPeer` / `leavePeer`).
- **Fix status:** Known gap — dedupe stale agent peers on reconnect (not yet implemented).

### Chat shows nothing while “Working…”

- Worker may not have called `setProgressOutput` yet (live LLM path only reports at collab join + “Planning with model…” until tools finish).
- Mock path (`MASTRA_ORCHESTRATE_MOCK=true`) reports after each step.

### Editor chat history gone after refresh

- Thread is **in-memory** in the editor hook only.
- Tasks remain in `agent_tasks` and Admin → Tasks.

---

## Gaps (as of 2026-08-06)

- No task/trace id in editor chat UI
- No SSE/WebSocket push — polling only (800ms editor, 2s admin)
- Raw errors not humanized in chat
- No per-step stdout logging (DB + OTEL only)
- Stale duplicate agent presence on collab reconnect
- No persisted chat transcript (tasks are the audit record)

---

## Quick local stack reminder

| Service | Port | Role |
|---------|------|------|
| API + agent worker | 3000 | Tasks, collab WS, BullMQ consumer |
| Client | 5173 | Visual editor |
| Redis | 6379 | BullMQ |
| Postgres | 5432 | `agent_tasks`, `document_ops` |
| Jaeger | 16686 / 4318 | Traces |

Restart **API** after crashes — if only the client restarts, collab/agent runs can fail silently or show stale presence.
