# Email templates — json-render spec + React Email (target)

> **Date:** 2026-08-04  
> **Related:** [`INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md`](./INTEGRATIONS-VAULT-NANGO-AGENTS-ROADMAP.md) Phase I-c · [`PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md`](./PLATFORM-PALETTE-SECRETS-NOTIFICATIONS.md)

---

## TL;DR

**Yes — the whole email is a json-render spec.** [`@json-render/react-email`](https://json-render.dev/docs/api/react-email) turns the same JSON spec model as layouts into HTML via React Email. **No `html_body` fallback.**

**Yes — templates are normal CMS documents.** Merchants manage them like any other content type: Admin → Content → `notification_email`, draft, publish. Same documents domain, same permissions, same org scope.

What v1 shipped (`html_body` + `{{var}}`) was a **temporary shortcut**. I-c.2 **replaces** it with spec-only render.

---

## Investigation: json-render + React Email

`@json-render/react-email` (same json-render family we already use at `^0.19.0`) provides:

| API | Where | Purpose |
|-----|--------|---------|
| `renderToHtml(spec, { state })` | Server (notifications service) | Final HTML at enqueue → Resend |
| `renderToPlainText(spec, { state })` | Server | Optional text part |
| `Renderer` / `createRenderer` | Admin client | Live preview in browser |
| `schema`, `standardComponentDefinitions` | Catalog | Html, Body, Text, Button, Section, … |

**Variables** use json-render **`$state`** (same as storefront specs), not hand-rolled `{{name}}`:

```typescript
import { renderToHtml } from "@json-render/react-email";

const html = await renderToHtml(spec, {
  state: { name: "Alex", taskName: "Summarize inbox" },
});
```

**Root rule:** email spec root must be `Html` → `Head` + `Body` (email-safe component set — not storefront `Stack` / `Button`).

This is the **same platform story** as layouts: org-owned **spec JSON** in Postgres, platform-owned **catalog**, render at use time.

---

## CMS model — same as any other content entry

| Concern | Same as `page`, `auth_provider`, …? |
|---------|-------------------------------------|
| Storage | ✅ `documents` table, org-scoped |
| Content type schema | ✅ `notification_email` registered via content-types API |
| Admin list / create / save / publish | ✅ `/admin/content/notification_email` → `ContentEntryAdmin` |
| Draft vs published | ✅ Worker/service loads **published** only |
| Keto / folder scope | ✅ Same document ACL pipeline |

**Not** a storefront URL page — emails are not rendered at `/about?edit=true`. They are **CMS entries** edited in admin content, like `auth_provider` or `page`.

### Proposed `notification_email` schema (I-c.2 — spec only)

| Field | Type | Purpose |
|-------|------|---------|
| `template_key` | text | Stable id (`agent-task-complete`, `welcome`) |
| `subject` | text | Subject line (can use `$state` in spec props or separate field) |
| `spec` | json | **json-render email spec** (body layout) |
| `category` | enum | `transactional` \| `agent` \| `marketing` (notification prefs) |

**Remove:** `html_body`, `text_body` — no fallback path.

---

## Edit UI — content admin + email preview

### What works today (v1)

`/admin/content/notification_email` — same shell as every content type: entry list, field form, Save draft, Publish.

### Gap for spec editing

`ContentEntryAdmin` today **does not edit `json` fields** (`isEditableField` skips them). So I-c.2 needs one of:

| Approach | Effort | UX |
|----------|--------|-----|
| **A. Email spec editor component** in content admin | Medium | Best — preview pane + `@json-render/react-email` `Renderer`, PropsPanel-style (reuse visual-editor patterns) |
| **B. JSON textarea** for `spec` (like `/admin/layout` spec JSON) | Low | Power users only |
| **C. Generic json field textarea** in `ContentEntryFieldInput` | Low | Works for all json CMS fields, no preview |

**Recommendation:** **A** — dedicated field widget for `spec` on `notification_email` only: left = structure/preview, right = props. Still **inside** `/admin/content/notification_email`, not a separate product.

Merchants do **not** need a new mental model — still Content → pick type → edit entry → publish.

---

## Send path (spec only)

```
Trigger (agent / machine / admin)
  → enqueueTemplatedEmail(orgId, templateId, variables, to, userId?)
  → notifications.service:
      load published notification_email CMS doc
      renderToHtml(doc.spec, { state: variables })
      subject from doc.subject (or spec Preview component)
      check notification_preferences by category
      queue email-outbound { subject, html, text? }
  → worker → Vault comms → Resend
```

`notifications/content-types/notification-email/` becomes: **load CMS doc + call renderToHtml** (replace `{{var}}` html parser).

---

## Packages (I-c.2)

```bash
pnpm add @json-render/react-email @react-email/components @react-email/render -F @noname/server
pnpm add @json-render/react-email @react-email/components -F @noname/client
```

(`@json-render/core` already present.)

---

## Phase plan

### I-c.1 — Temporary (replace in I-c.2)

- [x] Send pipeline + `enqueueTemplatedEmail`
- [x] CMS type with `html_body` — **delete when I-c.2 lands**

### I-c.2 — Spec-only React Email

- [x] `@json-render/react-email` render at enqueue (`email-template.ts`)
- [x] CMS schema: `spec` json (no html fields)
- [x] Admin: spec JSON + live preview in Content → `notification_email`
- [x] Seed specs in `scripts/seed/email-specs.ts`
- [ ] Agent/machine callers pass `templateId` where fixed layout applies

---

## FAQ

**Why did v1 use raw HTML?**  
Unblocked send + CMS ownership before adding React Email deps. Not the long-term design.

**Fallback?**  
**No.** One renderer: json-render email spec → `renderToHtml`.

**Same as editing a page?**  
Same **CMS document** workflow (content type, entries, publish). Different **canvas** — email spec + inbox preview, not storefront `?edit=true`.

**AI-generated emails?**  
Same as layouts: agent outputs valid email spec against `standardComponentDefinitions` catalog; merchant publishes in Content admin.

**Password reset?**  
ZITADEL templates — out of scope.

---

## Implementation checklist (I-c.2 PR)

- [ ] Migrate `notification_email` content type to `spec` json (no html fields)
- [ ] Server: swap renderer to `@json-render/react-email`
- [ ] Client: `EmailSpecFieldInput` (preview + edit) wired into content entry form
- [ ] Seed specs for demo templates
- [ ] Delete v1 html_body code paths
