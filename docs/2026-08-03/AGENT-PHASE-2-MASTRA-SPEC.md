# Agent Phase 2 — Multi-step Mastra runtime (full spec)

> **Status:** **Mock orchestrate shipped** (2026-08-05) — live LLM planner run open  
> **Prerequisite:** ✅ Phase I + mock path (E2E A5/U4)  
> **Goal:** One merchant task (“Optimize my checkout”) → agent runs **many tool steps** on the platform → human reviews → human publishes  
> **Related:** [`AGENT-ORCHESTRATE-DEMO.md`](../2026-08-04/AGENT-ORCHESTRATE-DEMO.md) · [`BUILD-MASTER-INDEX.md`](../2026-08-05/BUILD-MASTER-INDEX.md) · [`AGENT-OWNERSHIP-AND-REVIEW.md`](./AGENT-OWNERSHIP-AND-REVIEW.md)

---

## 1. What changes vs what stays

### Stays (do not rewrite)

| Layer | Already shipped |
|-------|-----------------|
| Task API | `POST/GET /api/agents/tasks`, approve/reject |
| Queue | BullMQ `agent-tasks`, worker concurrency, retries |
| Persistence | `agent_tasks`, `registered_agents`, audit columns |
| Auth | Agent JWT, `intersectAgentPermissions`, Keto `Agent` subject |
| Write audit | `document_ops`, `x-agent-task-id` |
| Review rules | Owner + admin ([`AGENT-OWNERSHIP-AND-REVIEW.md`](./AGENT-OWNERSHIP-AND-REVIEW.md)) |
| Human publish | Separate human JWT + publish permission |

### Replaces (Phase 2)

| Today | Phase 2 |
|-------|---------|
| `AgentExecutor` in `server/index.ts` — `switch(type)` → one `ai-pipeline` call | **Mastra agent loop** inside `AgentExecutor.execute()` |
| Mock `analyzeAnalytics` | Real tool calling analytics API |
| Single blob in `task.output` | Structured **run report**: steps[], artifacts[], summary |
| Client: approve/reject only | Client: **step progress + artifact list + review** from day 1 |

---

## 2. Runtime architecture

```
Merchant / owner
  POST /api/agents/tasks { prompt, registeredAgentId, type: "orchestrate" }
       │
       ▼
BullMQ job { taskId, orgId, prompt, input, registeredAgentId }
       │
       ▼
agent/worker.ts
  entity.start() → persistAgentTask
  executor.execute(orgId, "orchestrate", prompt, { taskId, registeredAgentId, agentToken? })
       │
       ▼
Mastra runtime (NEW packages/server/src/domains/agent/mastra/)
  loop: plan → pick tool → guard → execute → memory → until stop | maxSteps
       │
       ├── tools call domain HTTP *or* in-process ports with AuthActor=agent
       ├── each draft write → documents API → document_ops + taskId header
       └── append step to in-memory run log
       │
       ▼
entity.complete({ steps, artifacts, summary, model, tokens })
  persistAgentTask → status completed
       │
       ▼
Owner/admin reviews in Agents admin UI → approve/reject (unchanged)
Human publishes drafts (unchanged)
```

**Swap surface:** only `createMastraExecutor(deps)` wired in `server/index.ts` instead of inline `switch`.

---

## 3. Server spec

### 3.1 Dependencies

```json
"@mastra/core": "<pinned version>"
```

Optional later: `@mastra/memory`, `@mastra/evals`. Phase 2.0 uses in-task memory only (job-scoped).

### 3.2 `AgentExecutor` contract (unchanged signature)

```typescript
// packages/server/src/domains/agent/tools.ts
execute(orgId, type, prompt, input): Promise<AgentToolResult>
```

**New task type:** `orchestrate` (multi-tool). Existing types (`generate_layout`, etc.) remain as **fast path** single-shot until migrated.

**Input (orchestrate):**

```typescript
{
  taskId: string;
  registeredAgentId: string;
  maxSteps?: number;        // default 10
  allowedTools?: string[];  // from registered_agents.allowedTools
}
```

**Output (AgentToolResult.output):**

```typescript
{
  summary: string;           // human-readable run summary
  steps: AgentStepRecord[];
  artifacts: AgentArtifact[]; // doc ids / layout ids touched
  stoppedReason: "completed" | "max_steps" | "error" | "denied";
}

interface AgentStepRecord {
  index: number;
  tool: string;
  status: "ok" | "denied" | "error";
  startedAt: string;
  durationMs: number;
  inputSummary?: string;     // no full PII prompts in Postgres by default
  outputSummary?: string;
  documentIds?: string[];
}

interface AgentArtifact {
  kind: "layout" | "content" | "insight";
  documentId?: string;
  label: string;
}
```

Persist full step detail in `agent_tasks.output` (jsonb). Optional Phase 2.1: `agent_task_steps` table if rows grow large.

### 3.3 Tool registry (Mastra tools → platform)

Each tool is a Mastra tool whose `execute` receives **agent context** (orgId, agentId, onBehalfOf, taskId, permissions, userToken or internal port call).

| Tool | Guard | Action |
|------|-------|--------|
| `readAnalytics` | auto | Query analytics aggregations (read-only) |
| `readDocument` | auto | GET document by id (viewer+) |
| `generateLayoutDraft` | human_approval | ai-pipeline → PUT layout draft via documents service |
| `generateContentDraft` | human_approval | ai-pipeline → PUT content draft |
| `generateMachineDraft` | human_approval | ai-pipeline → machines domain (when ready) |
| `listFolderDocuments` | auto | List docs in collection agent can edit |
| `updateDraftField` | human_approval | Patch single content field |
| `publish` | **denied** | Never exposed to agent runtime |

**Guard mapping:**

```typescript
type ToolGuard = "auto" | "human_approval" | "denied";
// auto → run immediately
// human_approval → run but result stays draft; counted in artifacts for review
// denied → tool not registered for agent token
```

Effective tools = `allowedTools` on registered agent ∩ creator permissions ∩ guard !== denied.

### 3.4 Internal vs HTTP tools

**Phase 2.0 (preferred):** In-process **ports** with synthetic `AuthActor`:

```typescript
{ type: "agent", agentId, agentSlug, onBehalfOf, orgId, permissions }
```

Pass to existing `documents` / `analytics` services — reuses Keto checks via same guards as HTTP.

**Phase 2.1:** HTTP loopback with minted agent token (tests full edge path).

### 3.5 LLM layer (`ai-pipeline`)

Mastra calls `ai-pipeline` for generation tools only — not for orchestration planner.

| Responsibility | Owner |
|----------------|--------|
| Orchestration (“what tool next?”) | Mastra + planner model |
| Layout/content JSON generation | `ai-pipeline` providers (OpenAI/Anthropic/mock) |
| Token totals | Sum pipeline tokens + planner tokens → `agent_tasks.tokens` |

**Prompt templates (new file):** `packages/server/src/domains/ai-pipeline/prompts/`

- `orchestrate-system.ts` — store context, guard rules, folder scope hint
- `layout-from-insights.ts`, `content-from-insights.ts`

Env for local dev only: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`. Production planner keys resolve per org via `secrets.resolveLlmApiKey` → Vault BYOK → platform path (`resolve-planner-model.ts`).

### 3.6 Worker changes

```typescript
// worker: pass registeredAgentId + taskId in input
await executor.execute(orgId, type, prompt, {
  taskId,
  registeredAgentId: row.registeredAgentId,
  ...
});
```

Optional: `entity.recordStep()` mid-run via progress callback (Phase 2.1 streaming).

### 3.7 New env vars

| Var | Default | Purpose |
|-----|---------|---------|
| `MASTRA_PLANNER_MODEL` | `gpt-4o-mini` | Orchestration model |
| `AGENT_MAX_STEPS` | `10` | Global cap |
| `AGENT_ORCHESTRATE_ENABLED` | `true` | Feature flag |

---

## 4. Client spec (build from Phase 2 start — not bolt-on)

### 4.1 Admin UI (`AgentsAdminForm` extensions)

**New catalog props / labels (seed + `components.ts`):**

| Prop | Purpose |
|------|---------|
| `stepsColumnHeader` | Task table |
| `artifactsSectionTitle` | Expanded task detail |
| `stepStatusLabel` | ok / denied / error |
| `runSummaryLabel` | Mastra summary text |
| `noArtifactsMessage` | Empty state |

**New UI blocks:**

1. **Task row expand** — show `output.steps` timeline (icon per tool)
2. **Artifacts list** — links to admin content/layout edit routes (`documentId`)
3. **Create task form** (owner/admin) — prompt + pick registered agent + type `orchestrate`
4. **Running state** — poll `GET /tasks/:id` while `status === running` (2s interval)

**New `$state` paths:**

```typescript
ADMIN_STATE.agents.selectedTaskId
ADMIN_STATE.agents.selectedTaskDetail  // optional cache
```

**New actions:**

| Action | API |
|--------|-----|
| `createAgentTask` | `POST /api/agents/tasks` |
| `loadAgentTaskDetail` | `GET /api/agents/tasks/:id` |

Approve/reject unchanged.

### 4.2 json-render catalog

Register any new subcomponents in `admin/registry.ts`:

- `AgentTaskStepsTimeline` (optional split from monolithic form)

Phase 2.0 may keep everything in `AgentsAdminForm` if ≤ ~80 lines added.

### 4.3 Storefront / editor

**No Phase 2 client changes** — agents are admin-only. Visual editor does not embed Mastra.

---

## 5. Security & audit (non-negotiable)

1. Every draft write from a tool → `auditFromContext` equivalent with `taskId` + agent actor.
2. Tool guard `denied` → never register tool with Mastra for that agent.
3. Orchestrate tasks **must** set `registeredAgentId` (owner review path).
4. Planner prompt must not include secrets, full JWT, or other tenants’ data.
5. `output.steps` stores **summaries** by default; full prompts opt-in via `AGENT_LOG_FULL_PROMPTS=true` (dev only).

---

## 6. Implementation order

| Step | Deliverable | Est. |
|------|-------------|------|
| **2.1** | `@mastra/core`, `createMastraExecutor`, one tool (`readAnalytics` real) | 2–3 d |
| **2.2** | Draft tools (`generateLayoutDraft`, `generateContentDraft`) + in-process ports | 3–4 d |
| **2.3** | `orchestrate` task type + structured `output` schema + tests | 2 d | ✅ |
| **2.4** | Client: create task + steps timeline + artifacts links | 2–3 d | ✅ |
| **2.5** | Prompt templates + token accounting + OTel spans per step | 1–2 d | ✅ |
| **2.6** | Docs + seed demo task walkthrough | 1 d | ✅ |

**Replace executor** at step 2.1 — keep old `switch` as fallback behind `AGENT_ORCHESTRATE_ENABLED=false`.

---

## 7. Acceptance criteria (spec 100)

- [x] Merchant can queue `orchestrate` task with prompt + registered agent.
- [ ] Worker runs **live** Mastra planner with ≥3 tools in one job (analytics → layout → content) — needs Vault LLM key; **mock path verified** in E2E (A5.3, U4.3).
- [x] Each draft write appears in `document_ops` with `actorType=agent`, `taskId`, `onBehalfOf` (layout/content tools pass audit).
- [x] Task completes with structured `output.steps` + `output.artifacts` (schema + executor tests).
- [x] Agent owner sees task + steps + artifacts in admin UI; can approve/reject.
- [x] Agent cannot call publish tool (hard deny via `guards.ts`).
- [x] Store admin can approve tasks without `registeredAgentId` (`canReviewAgentTask` unchanged).
- [x] With no LLM API key, mock path completes orchestrate with mock tool outputs — `MASTRA_ORCHESTRATE_MOCK=true` (7-step mock run; E2E A5.3/U4.3).
- [x] Unit tests: tool guards, executor output shape, `canReviewAgentTask` unchanged.
- [x] No new permission store — Keto + `@noname/auth` only.

---

## 8. Explicitly out of scope (Phase 2)

- Langfuse / LangSmith integration
- Agent auto-publish on approve
- `Agent#reviewers` Keto relation (see ownership doc)
- Storefront agent chat UI
- Cross-task long-term memory (30-day Mastra memory) — Phase 2.2+

---

## 9. File map (where code lands)

```
packages/server/src/domains/agent/
  mastra/
    executor.ts          # createMastraExecutor(deps)
    agent.ts             # Mastra Agent definition
    tools/
      read-analytics.ts
      generate-layout-draft.ts
      generate-content-draft.ts
      index.ts
    guards.ts            # ToolGuard + filter by permissions
  worker.ts              # pass registeredAgentId in input
packages/server/src/domains/ai-pipeline/prompts/
  orchestrate-system.ts
  ...
packages/server/src/index.ts   # wire createMastraExecutor
packages/client/src/admin/components/agents/
  AgentsAdminForm.tsx    # steps + create task + artifacts
packages/client/src/core/actions/agents.ts
packages/client/src/auth/agents.ts
scripts/seed/demo.ts     # labels + optional demo orchestrate task
```

---

## 10. Decision log

| Decision | Rationale |
|----------|-----------|
| Mastra behind `AgentExecutor` | Swap ~one module; keep DDD boundaries |
| In-process ports first | Faster, same Keto path; HTTP later for parity tests |
| Client in same phase | Review UX useless without steps/artifacts |
| `orchestrate` type vs overloading existing types | Clear queue routing + UI |
| Postgres run log in `output` jsonb | Enough until traces > 100KB |

**Next action:** Implement **2.1** — install Mastra, `createMastraExecutor`, feature flag, real `readAnalytics` tool.
