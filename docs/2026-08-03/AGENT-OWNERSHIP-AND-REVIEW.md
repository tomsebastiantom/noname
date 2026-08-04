# Agent ownership, scope bindings, and task review

> **Status:** Shipped (A′.7 follow-up)  
> **Related:** [`IDENTITY-AGENTS-MASTER-PLAN.md`](./IDENTITY-AGENTS-MASTER-PLAN.md) · [`ACCESS-AND-ROLES.md`](./ACCESS-AND-ROLES.md) · [`FOLDERS-SCOPE-PLAN.md`](./FOLDERS-SCOPE-PLAN.md)

## Principle

Agents reuse the **same Keto graph** as humans. Platform permissions (`@noname/auth`) cap what an agent token can do; Keto caps **which folders/docs** it can touch. Task review is a **third, smaller rule set** on top — who may sign off on completed agent work.

Do **not** invent a separate agent permission store.

---

## Who can do what (today)

| Action | Store admin (`agent:manage`) | Agent owner | Other editor |
|--------|------------------------------|-------------|--------------|
| Register agent | ✅ | ✅ (if draft role) | ✅ (if draft role) |
| Mint token / grant folder | ✅ | ✅ own agents only | ✅ own agents only |
| Delete agent | ✅ | ✅ own agents only | ❌ |
| Create task (no linked agent) | ✅ | ❌ | ❌ |
| Create task (linked to own agent) | ✅ | ✅ | ❌ |
| List / approve / reject task | ✅ all tasks | ✅ tasks linked to **own** agent | ❌ |
| Publish content/layout | ✅ | ✅ (human JWT, publish role) | per role |

**Owner** = `registered_agents.owner_user_id` + Keto tuple `Agent:{slug}#owners @ User:{sub}` (kept in sync on register/delete).

---

## Task ↔ agent link

`agent_tasks.registered_agent_id` (nullable) ties a completed task to one registered agent.

- Tasks **with** a link → owner or admin may approve/reject.
- Tasks **without** a link → **admin only** (legacy / manual queue items).

When enqueueing work for a registered agent, always set `registeredAgentId` on create.

---

## Scope admin: agent bindings

**Settings → Content access** lists:

1. **Folder ↔ team** bindings (edit / publish)
2. **Folder ↔ agent** bindings (edit only — agents never publish)

Grant agent folder access on **Settings → Agents**; revoke from either Agents or Content access (same Keto tuple).

Tuple: `Collection:{folder}#editors @ Agent:{slug}`

---

## Edge cases (documented, not all implemented)

### Employee should review but is not the agent owner

**Today:** Only store admin or the registering owner can approve.

**Later options (pick one when needed):**

1. **`Agent#reviewers` Keto relation** — access manager assigns reviewers; approve guard checks `Check(reviewer, review, Agent:{slug})`.
2. **`agent:review` platform permission** — any publisher can approve any task (broader, simpler, less safe).
3. **Team inheritance** — if agent only edits folder F and team T has publish on F, T’s publishers may approve tasks for that folder (complex; defer).

**Recommendation:** Option 1 when a merchant asks for “my editor approves my bot’s drafts.” Until then, owner + admin is enough.

### Owner leaves the company

- Store admin deletes the agent (revokes Keto tuples + registry row).
- Or reassign owner (not implemented — admin re-register or future `PUT /registry/:id/owner`).

### Agent writes outside granted folder

Blocked by `denyUnlessDocumentAccess` → Keto `Check(Agent:{slug}, edit, Collection|Document)`.

---

## Enforcement map

```
Platform JWT / agent token  →  intersectAgentPermissions (cap capabilities)
Keto Check on write         →  Collection / Document graph (cap scope)
Postgres owner_user_id      →  mutate own agent + review linked tasks
agent:manage                →  bypass for store admin
```

Audit: `document_ops` (what changed) + `agent_tasks.approved_*` (who signed off).
