# Audit scope — what belongs in the audit table, and for which tenant

> **Status:** proposed scope · **Date:** 2026-11-07 (America/Toronto)
> **Question:** is `evidence_audit_events` for platform things, tenant things, or both? Who owns a row when a
> platform operator touches a tenant? Where do release, machine definitions, documents and roles go?
> **Related:** [`AUDIT-LOGGING-DESIGN.md`](./AUDIT-LOGGING-DESIGN.md) · [`RELEASE-CONTROL-SUMMARY.md`](./RELEASE-CONTROL-SUMMARY.md)

---

## 1. The rule (one sentence)

**An audit row belongs to the tenant whose state was touched, not to the actor and not to the tool that touched
it.** Platform-global actions belong to the platform org.

```
org_id  = affected tenant   (or PLATFORM_ORG_ID for global actions)
actor   = who did it        (tenant user | platform operator | service | provider)
action  = what authority was exercised
subject = the resource touched (tenant, definition, layout, release assignment)
```

This is the same rule Kubernetes uses (`objectRef.namespace` is the affected namespace, `user` is the actor) and
the same rule enterprise audit logs use.

## 2. Two meanings of “release”

| Word | Owner | Example | Audit? |
|---|---|---|---|
| **Tenant publish** | tenant | editor publishes a page/layout | `org_id = tenant`, `action = page.published`, actor = editor |
| **Platform release** | platform | operator promotes tenant to r_17 | `org_id = tenant`, `action = platform.release.tenant_promoted`, actor = operator |
| **Release artifact created** | platform | build r_17 (no tenant yet) | `org_id = PLATFORM_ORG_ID`, visible only to platform |

The **artifact** is platform-owned; the **assignment** affects a tenant. So the promotion is tenant-scoped even
though the release is a platform object.

## 3. Resource ownership vs audit scope

| Resource | Owner | Audit `org_id` | Tenant sees it? |
|---|---|---|---|
| pages, layouts, content, products | tenant | tenant | yes |
| machine definitions | tenant | tenant | yes |
| tenant settings (slug, integrations) | tenant | tenant | yes |
| tenant roles / invites | tenant | tenant | yes |
| order, payment, receipt | tenant | **Evidence record + activity** (not audit) | yes |
| release artifact + bundle | platform | platform org (creation) | no |
| tenant → release pointer | platform control plane | **tenant** (the assignment) | yes |
| environment selector (server) | platform | platform org | no (global state) |
| eval gate decision | platform measurement | **Evidence record** (subject tenant) | yes as evidence |
| operator token issued/revoked | platform | platform org | no |
| login / MFA | ZITADEL | mirrored to tenant if it concerns that user | optional |

## 4. Action catalogue (what is audited, what is not)

| Action | Audit? | Why |
|---|---|---|
| `page.published`, `layout.published` | **yes** | changes what customers see; tenant wants to know who |
| `document.draft_saved` | no | version history already stores it; too noisy |
| `machine_definition.created/updated` | **yes** | changes runtime behaviour for that tenant |
| `tenant.settings_updated` | **yes** | slug, integrations, auth config |
| `tenant.role_granted/revoked` | **yes** | access change |
| `platform.release.created` | **yes** (platform) | artifact creation is a control-plane action |
| `platform.release.tenant_promoted` | **yes** (tenant) | changes what that tenant loads |
| `platform.release.rollback` | **yes** (tenant) | same |
| `platform.environment.switched` | **yes** (platform) | affects all tenants; global row |
| `platform.operator.token_issued/revoked` | **yes** (platform) | access change |
| `commerce.order.created`, `payment.receipt` | **no — Evidence record + activity** | business facts, not authority |
| `eval.run` | **no — Evidence record** | measurement result |
| every HTTP request | **no — access log** | telemetry, not authority |

## 5. Three examples

### A. Tenant editor publishes a page

```
org_id  = yoga
actor   = user:u_123 (editor)
action  = page.published
subject = page:home
```
Yoga sees it in its audit; another tenant does not.

### B. Platform operator promotes Yoga to r_17

```
org_id  = yoga                  ← affected tenant, even though the actor is the platform
actor   = service:release-operator
action  = platform.release.tenant_promoted
subject = tenant.storefront:yoga
metadata= { from: r_16, to: r_17, requestId }
```
Yoga sees “operator moved us to r_17” in **its** audit. The operator sees the same row in the platform stream.
The release artifact itself is not copied into the row — only `r_17` as a reference.

### C. Operator switches the server stack

```
org_id  = PLATFORM_ORG_ID       ← global action, no single tenant
actor   = service:release-operator
action  = platform.environment.switched
metadata= { environment: production, from: r_16, to: r_17 }
```
No tenant sees this row; it is platform-scoped. Tenants experience it as “the platform updated”, not as an audit
entry about their content.

## 6. Why this scope is correct

1. **Tenant visibility follows the affected org.** A tenant can answer “who changed my storefront?” without
   seeing other tenants or platform internals.
2. **Cross-tenant actions are auditable per tenant.** A wave produces N tenant rows plus one platform summary,
   so each affected tenant has its own record.
3. **Platform-global actions are not attributed to a random tenant.** The selector and release creation are
   platform org events.
4. **Business facts stay out.** Orders/payments/eval are Evidence records + activities, not audit.
5. **No release payload duplication.** The audit row references `releaseId`; the release table owns the data.

## 7. What this means for the current implementation

- `evidence_audit_events` is **multi-tenant and org-scoped**, not “platform-only”.
- `platform.release.tenant_promoted` should be written with `org_id = tenant` and `actor = operator` — not as an
  `evidence_records` row.
- Release creation and environment switch are `org_id = PLATFORM_ORG_ID`.
- The tenant audit endpoint filters by edge `org_id`; the platform endpoint is separate.
- The table is not “business evidence”; it is the audit primitive of the kernel.

## 8. Decisions this settles

| Question | Answer |
|---|---|
| Is the audit table platform or tenant? | **both** — scoped by the affected org |
| Does a platform action on a tenant go in the tenant's audit? | **yes** |
| Does release state go in audit? | **no** — only the action and `releaseId` |
| Do machine definitions/pages go in audit? | **yes** for publish/change actions, not every draft |
| Do orders/payments go in audit? | **no** — Evidence records + activities |
| Does the selector go in tenant audit? | **no** — platform-global row |
