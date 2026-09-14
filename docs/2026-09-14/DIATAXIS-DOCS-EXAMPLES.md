# Diátaxis Documentation Examples for Noname

Date: 2026-09-14
Status: Example information architecture and sample pages

## Short answer

Yes. Diátaxis is a free, open documentation framework, not a paid documentation platform. It tells us how to organize content around four reader needs:

```text
tutorials      learn by completing a guided journey
how-to guides  complete one practical task
reference      look up exact facts and contracts
explanation    understand architecture and reasoning
```

For the website, use a free and open-source docs site such as Docusaurus, then organize the pages using Diátaxis.

```text
Docusaurus = the website and tooling
Diátaxis   = the content architecture
Markdown   = the source format
Git        = review, version, and history
```

## Short setup example

```bash
npx create-docusaurus@latest apps/docs classic --typescript
cd apps/docs
npm run start
```

Recommended initial tree:

```text
apps/docs/
  docs/
    get-started/
    how-to/
    concepts/
    reference/
    decisions/
  src/
  sidebars.ts
  docusaurus.config.ts
```

The first version does not need a large custom theme, a CMS, or a hosted vendor. Start with Markdown/MDX, Git review, and a simple deployment.

## Example 1 — Tutorial

A tutorial is short, linear, and beginner-focused. It should prove the happy path from a clean local setup.

````md
# Build Your First Noname Store

> Type: Tutorial
> Audience: new developer
> Time: 10 minutes
> Verified: 2026-09-14

## What you will build

You will start Noname, seed a demo tenant, and open the storefront with the Commerce demo enabled.

## 1. Start the local stack

```bash
pnpm dev
```

## 2. Seed the demo environment

```bash
pnpm seed:demo:full
```

## 3. Open the storefront

Open:

```text
http://yogastore.localhost:5173/
```

You should see the seeded storefront and the Commerce product.

## 4. Open the admin

Open:

```text
http://yogastore.localhost:5173/admin
```

Sign in with the local seeded admin credentials.

## What happened

The platform profile seeded the tenant, layouts, pages, users, and authorization. The Commerce profile added the product, cart machine, and demo order Evidence.

## Next

- [Edit a storefront page](../how-to/edit-a-page.md)
- [Understand the render pipeline](../concepts/documents-and-layouts.md)
- [Read the seed profile reference](../reference/seed-profiles.md)
````

What makes it a tutorial:

- One linear path
- No architecture debate
- No exhaustive options
- Every step has a visible result
- It ends with useful next links

## Example 2 — How-to guide

A how-to guide solves one practical problem for a reader who already knows the basics.

````md
# Seed a Commerce Demo Environment

> Type: How-to guide
> Audience: developer or CI operator
> Time: 5 minutes
> Verified: 2026-09-14

## Goal

Populate a running local Noname stack with the platform and Commerce demo profiles.

## Prerequisites

- Podman services running
- API available at `http://localhost:3000`
- ZITADEL initialized
- Node and pnpm installed

## Choose a profile

Platform only:

```bash
pnpm seed:demo
```

Commerce only:

```bash
pnpm seed:demo:commerce
```

Everything in dependency order:

```bash
pnpm seed:demo:full
```

## Verify

Confirm:

```text
http://yogastore.localhost:5173/
http://yogastore.localhost:5173/admin/orders
```

The seed runner should report the selected profile and completed steps.

## Common failures

### API connection failed

Check:

```bash
curl http://localhost:3000/health
```

### Commerce catalog is missing

Run the full profile, or run the platform profile before the Commerce profile.

## Related reference

- [Seed profiles](../reference/seed-profiles.md)
- [Seed architecture](../concepts/seeding.md)
````

What makes it a how-to:

- Starts with a goal
- Lists prerequisites
- Gives the shortest successful procedure
- Includes troubleshooting
- Does not teach the entire platform

## Example 3 — Explanation page

An explanation page answers why and gives a mental model. It should not be a task checklist.

````md
# Evidence and Provenance

> Type: Explanation
> Owner: server/evidence and Commerce vertical
> Status: Current
> Verified: 2026-09-14

## Why this exists

Noname needs immutable, auditable records that multiple domains can read without every domain exposing its own custom API.

## Mental model

```text
Commerce event
  → immutable Evidence record
  → typed Evidence links
  → generic Evidence read API
  → domain-owned presentation
```

## Ownership

The server Evidence domain owns:

- persistence
- tenant boundaries
- immutability
- generic querying
- audit records

Commerce owns:

- order and payment meaning
- record types such as `commerce.order.created`
- relationships such as `paid_by` and `caused_by`
- Orders admin presentation

## What it does not do

Evidence is not:

- a mutable order aggregate
- a browser write API
- an analytics warehouse
- a replacement for Commerce persistence

## Related reference

- [GET /api/evidence/records](../reference/api/evidence.md)
- [Orders admin](../concepts/orders-admin.md)
- [Evidence ADR](../decisions/ADR-0005-evidence-provenance-kernel.md)
````

What makes it explanation:

- Explains purpose and boundaries
- Clarifies ownership
- Explicitly states non-goals
- Links to reference and decisions
- Does not pretend to be an API specification

## Example 4 — Reference page

A reference page is exact and compact. It should be generated from schemas where possible.

````md
# GET /api/evidence/records

> Type: HTTP reference
> Status: Current
> Source: packages/server/src/domains/evidence/routes.ts

## Purpose

List immutable Evidence records visible to the authenticated organization.

## Query parameters

| Parameter | Required | Description |
|---|---:|---|
| `type` | No | Filter by Evidence type, for example `commerce.order.created` |
| `subjectId` | No | Filter by subject identifier |
| `limit` | No | Page size, capped by the server |

## Example

```bash
curl \
  'http://localhost:3000/api/evidence/records?type=commerce.order.created&limit=50' \
  -H 'Authorization: Bearer <token>'
```

## Response

```json
{
  "data": [
    {
      "id": "record-id",
      "type": "commerce.order.created",
      "subjectType": "commerce.order",
      "subjectId": "demo-order-1001"
    }
  ]
}
```

## Errors

- `401` — missing or invalid authentication
- `403` — organization access denied
- `400` — invalid query parameters

## Related

- `GET /api/evidence/links/:recordId`
- `GET /api/evidence/audit`
- [Evidence explanation](../../concepts/evidence-and-provenance.md)
````

What makes it reference:

- Exact path and source
- Exact parameters
- Exact response shape
- Exact errors
- Minimal narrative

## Example 5 — Architecture decision record

````md
# ADR-0006: Commerce UI stays in the Commerce extension

- Status: accepted
- Date: 2026-09-14
- Owners: Commerce extension and platform client
- Supersedes: the earlier platform-core Orders implementation

## Context

The platform client owns generic shell, route, permission, and catalog behavior. Commerce owns Commerce semantics and presentation.

## Decision

Commerce Orders UI, actions, and Evidence presentation live in:

```text
packages/extensions/src/commerce
```

The platform client provides only generic integration points.

## Consequences

- Commerce can evolve without adding Commerce semantics to platform core.
- Generic Evidence APIs remain reusable by other verticals.
- Extension registration becomes the ownership boundary.

## Evidence

- `packages/extensions/src/commerce/orders-admin.tsx`
- `docs/2026-09-12/ORDERS-ADMIN-IMPLEMENTATION.md`
- `docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md`
````

## Page metadata

Every current page should begin with small, consistent metadata:

```yaml
---
title: Evidence and Provenance
sidebar_position: 4
status: current
owner: server/evidence
last_verified: 2026-09-14
audience:
  - contributor
  - extension-author
---
```

Historical records use:

```yaml
---
title: Checkout Reliability Implementation
status: historical
recorded: 2026-09-12
current_authority: ../2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md
---
```

## Small initial information architecture

Do not begin with 100 pages. Start with these 12:

```text
get-started/build-your-first-store.md
get-started/local-development.md

how-to/seed-a-commerce-demo.md
how-to/create-an-extension.md
how-to/add-a-commerce-component.md
how-to/verify-a-checkout.md

concepts/system-overview.md
concepts/documents-and-layouts.md
concepts/machines-and-xstate.md
concepts/evidence-and-provenance.md

reference/api/evidence.md
reference/seed-profiles.md
```

These pages cover the first user journey, the main contributor workflow, the architecture, and two exact contracts.

## Recommended approach

Use:

```text
Docusaurus
+ Markdown/MDX
+ Diátaxis page types
+ frontmatter metadata
+ OpenAPI-generated reference later
+ Git pull-request review
```

Keep the dated audit and implementation records under a separate history section. Do not make users read audit reports to learn how to build a store.