# Agent orchestrate demo walkthrough

> **Prerequisite:** Ops batch completed (`db:push`, services running, seed applied).  
> **Env:** `AGENT_ORCHESTRATE_ENABLED=true` (default), Redis + Postgres up.

## 1. Register an agent

1. Open **Admin → Agents**.
2. Register slug `demo-assistant`, label `Demo assistant`.
3. (Optional) Grant folder editor access for a content collection the agent should draft into.

New agents default to orchestrate tools: `readAnalytics`, `nango_trigger`, `generateLayoutDraft`, `generateContentDraft`. `publish` is never exposed.

## 2. Queue an orchestrate task

1. In **Run orchestrate task**, enter a prompt such as:  
   `Summarize recent storefront events and draft a hero layout template named checkout-hero.`
2. Select **Demo assistant** and click **Run task**.
3. The task appears in the table with status `pending` → `running`.

## 3. Watch progress

1. Click **View** on the task row.
2. While running, the detail panel polls every ~2s.
3. When complete, inspect:
   - **Summary** — planner narrative
   - **Steps** — tool timeline (`readAnalytics`, `generateLayoutDraft`, …)
   - **Artifacts** — links to `/admin/layout/…` or `/admin/content/…` drafts

## 4. Review and approve

1. Open artifact links and verify drafts (status `draft`, not published).
2. Click **Approve** or **Reject** on the task row (owner or store admin).

## 5. Verify platform side effects

| Check | Where |
|-------|--------|
| Task output jsonb | `agent_tasks.output` — `steps[]`, `artifacts[]`, `summary` |
| Document audit | `document_ops` — `actorType=agent`, `taskId`, `onBehalfOf` |
| Outbound webhook | Subscription on `agent.task.completed` receives `{ taskId, type }` |
| Token total | `agent_tasks.tokens` — planner + ai-pipeline generation tokens |

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `orchestrate tasks require registeredAgentId` | Pick a registered agent in the form |
| Task fails immediately | Check worker logs; ensure `AGENT_ORCHESTRATE_ENABLED` is not `false` |
| No LLM response | Set platform `OPENAI_API_KEY` or org BYOK via integrations admin |
| Empty steps | Mastra planner may finish without tools — try a prompt that explicitly asks for analytics + a layout draft |
