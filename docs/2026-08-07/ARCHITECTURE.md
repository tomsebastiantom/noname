# Architecture issues

> Layering, coupling, god files, and domain wiring. See [`README.md`](./README.md) for scope/method.

---

## Server (`packages/server`)

### God-wiring in `index.ts` (HIGH)

`src/index.ts` is a 234-line manual composition root: 15 domain factories called in sequence, each wired to shared deps (`db`, `storage`, `authorization`), each mounted with `app.route(...)`. There is no plugin/registry abstraction — every new domain is a hand-edit to this one file, and dependency order matters implicitly (documents must be created before most others because they depend on `docs.service.tenantSettings` / `docs.service.content`).

```70:222:packages/server/src/index.ts
const docs = createDocumentsDomain({ db, storage, authorization, ... });
const secrets = createSecretsDomain({ tenantSettings: docs.service.tenantSettings });
const integrations = createIntegrationsDomain({ secrets: secrets.service, tenantSettings: docs.service.tenantSettings });
const notifications = createNotificationsDomain({ db, secrets: secrets.service, content: docs.service.content, tenantSettings: docs.service.tenantSettings });
// ... 11 more domains, each app.route(...) manually
```

**8+ domains** depend on `docs.service.tenantSettings` / `docs.service.content` — "documents" functions as a hidden platform layer, not a peer domain, despite being modeled as one of many.

### Cross-domain imports bypass domain boundaries (HIGH)

Several domains reach directly into another domain's internals rather than going through its public `contracts`/`ports` surface:

| From | Imports | Where |
|---|---|---|
| `documents/domain.ts` | `auth/create-authorization` | L3 |
| `auth/index.ts` | `documents/`, `notifications/` | L7–8 |
| `collab/index.ts` | `auth/`, `documents/` | L3–8 |
| `webhooks/outbound-router.ts` | `notifications/events`, `agent/events`, `machines/events` | L1–4 |
| `agent/index.ts` | `auth/adapters/zitadel/*` directly | L3–4 |

No true circular import cycle exists (verified — coupling is hub-and-spoke via `documents`), but the hub itself importing from a spoke (`auth`) is a smell: `documents` should be lower in the dependency graph than `auth`, not dependent on it.

### `createAuthorization()` instantiated up to 3x per process (MEDIUM)

```13:14:packages/server/src/domains/auth/create-authorization.ts
export function createAuthorization(): AuthorizationPort {
  return ketoAdapter();  // new Keto HTTP adapter each call
}
```

Called independently from `index.ts:68`, `auth/index.ts:26`, `documents/api.ts:20` (default fallback), and `documents/domain.ts:25` (fallback). Stateless today, but it violates single-composition-root and makes it easy for one call site to silently diverge (e.g. get a differently-configured adapter) as the code evolves.

### Inconsistent domain internal structure (MEDIUM)

| Pattern | Domains using it |
|---|---|
| `api.ts` + `routes/*.ts` split | documents, auth, flags, agent, analytics, tenant, machines, context, ai-pipeline (9 of ~15) |
| `routes/inbound.ts` only, no `api.ts` | webhooks |
| `contracts.ts` re-export barrel | documents only |
| `ports.ts` interface file | 15 domains, but some consumers import `contracts`, others `ports` for the same domain |

Not fatal, but a new contributor has no single rule to follow — "check what the domain next to yours did" is the only guidance, and it's inconsistent.

### God files — server (>300 lines)

| Lines | File | Concern |
|---|---|---|
| 525 | `domains/auth/scope/service.ts` | Collection/team CRUD + Keto tuple grant/revoke loops |
| 493 | `domains/documents/ports.ts` | All DTOs + 10+ service interfaces in one file |
| 492 | `domains/notifications/service.ts` | Email/SMS enqueue + inbox + preferences + templating |
| 491 | `domains/collab/layout-room.ts` | Automerge repo + WS room lifecycle + persistence |
| 481 | `domains/documents/adapters/postgres.ts` | All document storage in one adapter |
| 471 | `domains/notifications/adapters/postgres.ts` | All comms persistence |
| 404 | `domains/analytics/adapters/clickhouse.ts` | ClickHouse DDL + queries |
| 396 | `domains/webhooks/adapters/postgres.ts` | Webhook storage |
| 354 | `domains/auth/adapters/zitadel/client.ts` | Zitadel OIDC client |
| 336 | `domains/agent/mastra/executor.ts` | Mastra agent orchestration |
| 332 | `domains/auth/service.ts` | Login, team, MFA flows |
| 324 | `domains/collab/automerge-spec.ts` | Automerge ↔ layout spec conversion |
| 307 | `domains/collab/routes.ts` | WS + HTTP collab routes |
| 302 | `domains/auth/adapters/zitadel/management.ts` | Zitadel Management API |

### Event registry drift (LOW)

```17:30:packages/server/src/domain-events.ts
export const DOMAIN_EVENT_SOURCES = [
  AgentEvents, ContextEvents, ContentEvents, ... FlagEvents, MachineEvents,
] as const;
// CommsEvents, WebhookEvents NOT included
```

`CommsEvents` and `WebhookEvents` publish real events (`notifications/service.ts:136,200`, `notifications/worker.ts:58,83,98`, `webhooks/worker.ts:27`, `webhooks/outbound-worker.ts:66,98`) but analytics' auto-ingest subscribes only to `ALL_DOMAIN_EVENTS`, so **comms/webhook lifecycle events are invisible to analytics** — a silent product gap, not just a style issue.

---

## Client (`packages/client`)

### God components / hooks (HIGH)

22 files exceed 300 lines; the worst mix multiple unrelated concerns into one file:

| Lines | File | Bundled responsibilities |
|---|---|---|
| 932 | `admin/components/team/ScopeAdminForm.tsx` | Folder/team CRUD, agent bindings, member pickers, cards, forms, permission gating |
| 728 | `admin/components/agents/AgentsAdminForm.tsx` | Agent registry, task polling, session fetch, task detail |
| 717 | `components/rich-text/RichTextTipTapEditor.tsx` | TipTap setup, collab, paste sanitize, toolbar |
| 676 | `admin/schemas/components.ts` | All admin panel Zod schemas, one file |
| 608 | `editor/hooks/use-edit-page-orchestration.ts` | Layout draft, content draft, history, collab, save/publish, session assembly |
| 592 | `editor/components/canvas/EditorCanvas.tsx` | Selection, DnD, collab overlays, preview render |
| 455 | `main.tsx` | Routing, auth gates, catalog load, admin/editor/storefront render modes |

`main.tsx` alone has 15+ `useState` fields and a ~190-line `loadPage` function doing auth/MFA/catalog/schema fetch and mode selection in one place.

### Hand-rolled router with triple, unsynchronized route registries (HIGH)

Routing is not React Router — it's `useSyncExternalStore` + manual `history.pushState`/`popstate`:

```130:131:packages/client/src/main.tsx
const pathname = useSyncExternalStore(subscribeAppLocation, getPathname, getPathname);
const route = resolveRoute(pathname);
```

Three separate pathname→route mappings must be kept in sync by hand:

1. `platform-routes.ts` (`platformTemplateFromPath`) — drives the edge schema fetch
2. `auth/admin-routes.ts` (`ADMIN_ROUTE_PATHS`, `ADMIN_ROUTE_ACCESS`) — drives nav/permissions
3. Server-side seed nav — comment explicitly says IDs must match by hand

**This has already caused a live bug:** `/admin/settings/traces` is defined in `ADMIN_ROUTE_PATHS` (`auth/admin-routes.ts:48-62`) but has no matching branch in `platformTemplateFromPath` (`platform-routes.ts:23-46`), so it silently falls through to `"admin_home"`. The same function is reused for hover-prefetch (`platform/admin-panel-prefetch.ts:30-35`), so prefetch is also wrong for that route.

### Editor and admin layers are tightly coupled (HIGH)

The editor was designed to be a separable layer over the same catalog system, but in practice it imports admin internals directly:

```1:3:packages/client/src/editor/content-fields.ts
export { ContentEntryFieldInput } from "../admin/components/content/content-entry-field-input";
export { MediaFieldInput } from "../admin/components/content/MediaFieldInput";
```

```1:3:packages/client/src/core/actions/content.ts
import { emptyValuesForSchema } from "../../admin/components/content/content-entry-utils";
import { formatCollectionId } from "../../admin/document-folder";
```

`RichTextTipTapEditor.tsx:32` imports a type from `admin/components/content/MediaFieldInput`. Two separate json-render registries (`platform/registry.ts`, `editor/registry.ts`) paper over the resulting type mismatches with `as never` casts.

### Inconsistent state management (MEDIUM)

| Layer | Mechanism |
|---|---|
| App root | ~15 `useState` fields in `main.tsx` |
| Admin panels (compliant ones) | json-render `createStateStore` + `ADMIN_STATE` + `useStateValue` |
| Editor | `EditorSessionProvider` (split data/actions context) + `EditorPrefsProvider` |
| Some admin forms | Local `useState` + `useEffect` + direct fetch (bypasses the action/handler pattern entirely) |

Example bypass:

```198:201:packages/client/src/admin/components/agents/AgentsAdminForm.tsx
useEffect(() => {
  let cancelled = false;
  void fetchAuthSessionStatus().then((data) => { ... });
```

The editor session context is actually well-designed (stable action ref, split data/actions via `useMemo`), but several hot-path components ignore the split and pull the deprecated merged `useEditorSession()` hook instead — used 3x in `VisualEditorShell.tsx` (lines 31, 92, 217), with the code's own comment at line 135 warning "re-renders on any data change."

---

## Shared packages / cross-cutting

- **HMAC sign/verify duplicated across runtimes with no shared contract test.** Worker (`packages/workers/src/hmac.ts:27-37`) and server (`packages/server/src/shared/org.ts:27-36`) independently implement the same `orgId:userId:role` HMAC-SHA256 scheme. No shared test vectors — a change to one side alone would silently break edge auth.
- **`catalogProps` helper triplicated**: `packages/client/src/schemas/shared.ts:4-11`, `packages/extensions/src/catalog-props.ts:4-11` (identical, with a comment explaining why it can't be imported — extensions can't depend on client), and a third, simplified inline copy in `scripts/seed/demo.ts:36-39`.
- **Scripts import server/client internals directly**, crossing package boundaries that don't exist for anyone else: `scripts/seed/demo.ts`, `demo-users.ts`, `demo-commerce.ts`, `test-integrations-vault.ts` all import from `packages/server/src/domains/auth/adapters/zitadel/*` and `packages/client/src/core/login-form-labels` by relative path instead of a published interface. `scripts/seed/demo.ts` itself is 2,191 lines.

---

## What's actually good here (keep doing)

- Domain-factory pattern (`createXDomain(deps) → { routes, service }`) on the server — explicit, testable wiring, even if the composition root itself is a god file.
- Ports/adapters split exists in most server domains, enabling the in-tree test-only `allow-all-in-org` authorization adapter.
- The editor's split data/actions context (`editor-session.tsx`) is a legitimately good pattern that most of the client should be following more consistently.
- No real circular-import cycles despite the hub-and-spoke coupling.
- Slug parsing and `fetchWithTimeout` are properly centralized in `@noname/shared`/`@noname/auth` and reused correctly by workers/client — this is the sort of dedup other duplicated helpers (HMAC, `catalogProps`) should copy.
