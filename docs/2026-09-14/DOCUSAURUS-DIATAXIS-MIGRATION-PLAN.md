# Docusaurus + Diátaxis Documentation Migration Plan

Date: 2026-09-14
Status: Proposed implementation plan

## Decision

Build a new documentation site with:

```text
Docusaurus/MDX
+ Diátaxis page types
+ generated API reference
+ ADRs
+ dated history archive
+ code-audited current roadmap
```

The existing dated Markdown documentation remains in place. It is not moved, deleted, or used as the new site's primary navigation without curation.

## Existing documentation policy

The existing tree remains the historical source:

```text
docs/2026-05-23/
docs/2026-07-04/
docs/2026-07-25/
docs/2026-08-*/
docs/2026-09-*/
docs/archive/
docs/product/
```

New documentation is created under a new site tree. When an old document contains useful content, create a curated copy rather than moving the old file:

```text
old dated document
  → new current/tutorial/concept/reference/ADR page
  → frontmatter records the old source path and date
  → old document remains available as historical evidence
```

The new page must not copy stale status claims. It should copy concepts, decisions, examples, and verified implementation facts only.

## New site location

Recommended initial location:

```text
docs-site/
  package.json
  docusaurus.config.ts
  sidebars.ts
  docs/
  static/
  src/
```

Keep it as a separate documentation application rather than adding Docusaurus dependencies to the production client package.

Add a root command:

```text
pnpm docs:dev
pnpm docs:build
pnpm docs:serve
```

If the repository later standardizes all applications under `apps/`, the site can move to `apps/docs` in a separate mechanical change. Do not mix that relocation with the first content migration.

## New information architecture

```text
docs-site/docs/
  get-started/
    build-your-first-store.md
    local-development.md
    first-commerce-checkout.md

  how-to/
    seed-a-commerce-demo.md
    create-an-extension.md
    add-a-commerce-component.md
    add-a-machine-definition.md
    add-a-provider-adapter.md
    verify-a-checkout.md

  concepts/
    system-overview.md
    platform-model.md
    tenant-and-store-identity.md
    documents-and-layouts.md
    spec-driven-ui.md
    machines-and-xstate.md
    capabilities-and-public-access.md
    evidence-and-provenance.md
    integrations-and-nango.md
    analytics-and-replay.md
    seeding.md

  architecture/
    package-boundaries.md
    request-and-data-flow.md
    extension-lifecycle.md
    worker-and-edge.md
    persistence-and-events.md
    tenant-isolation.md

  decisions/
    ADR-0001-domain-vs-extension.md
    ADR-0002-xstate-transition-authority.md
    ADR-0003-generic-capability-routes.md
    ADR-0004-nango-provider-boundary.md
    ADR-0005-evidence-provenance-kernel.md
    ADR-0006-commerce-ui-ownership.md
    ADR-0007-seeding-and-fixture-boundaries.md

  reference/
    api/
      overview.md
      capabilities.md
      machines.md
      evidence.md
      integrations.md
    packages/
      server.md
      verticals.md
      extensions.md
      seeding.md
      fixtures.md
    schemas/
      machine-definition.md
      evidence-record.md
      catalog-component.md
      content-type.md
    permissions.md
    environment.md
    seed-profiles.md

  operations/
    local-stack.md
    database-migrations.md
    nango-setup.md
    checkout-verification.md
    worker-deployment.md
    cloudflare-deployment.md
    troubleshooting.md

  history/
    overview.md
    implementation-records.md
    verification-runs.md
    audit-reports.md
```

The dated source files remain under the repository `docs/` directory and can be linked from the history section or copied into the site history section without altering their original location.

## Page metadata

Every new current page must have frontmatter:

```yaml
---
title: Evidence and Provenance
sidebar_position: 4
status: current
owner: server/evidence
last_verified: 2026-09-14
source_paths:
  - packages/server/src/domains/evidence
  - packages/verticals/src/commerce/order-projection.ts
---
```

A curated page copied from an old document adds provenance:

```yaml
---
title: XState as the Transition Authority
status: current
owner: server/machines
last_verified: 2026-09-14
source_paths:
  - packages/server/src/domains/machines/engine.ts
source_documents:
  - docs/2026-09-08/XSTATE-REUSE-MIGRATION-PLAN.md
---
```

A history page uses:

```yaml
---
title: Checkout Reliability Implementation Record
status: historical
recorded: 2026-09-12
source_document: docs/2026-09-12/CHECKOUT-RELIABILITY-IMPLEMENTATION-DETAILS.md
current_authority: ../AUTHORITATIVE-ROADMAP-CURRENT.md
---
```

## ADR migration policy

Do not move the old dated ADR/design documents. Create new ADR pages only for accepted decisions that still govern the current code.

For each ADR:

1. Read the old decision document.
2. Verify the decision against current source and tests.
3. Copy only the context, decision, alternatives, consequences, and current evidence.
4. Add a stable ADR number.
5. Add `status: accepted`, `superseded`, `proposed`, or `rejected`.
6. Add `source_documents` with the old dated paths.
7. Add `implementation_evidence` with current source/test paths.
8. Add supersession links when the decision changed.
9. Leave the old document untouched.

The first ADRs should be:

```text
ADR-0001 Domain versus extension ownership
ADR-0002 XState as transition authority
ADR-0003 Generic capability routes
ADR-0004 Nango provider boundary
ADR-0005 Evidence/Provenance Kernel
ADR-0006 Commerce UI ownership
ADR-0007 Seeding and fixture boundaries
```

## Generated API reference

The API reference must not be hand-maintained as the only contract.

### Phase 1

Create a hand-curated reference page for the current stable generic routes:

```text
/api/evidence
/api/machines
/api/capabilities
/api/integrations
```

Each page links to its source route and tests.

### Phase 2

Export OpenAPI-compatible schemas from route definitions or create a checked-in OpenAPI document generated from the Hono/Zod boundary schemas:

```text
docs-site/static/openapi.json
```

Render it under:

```text
reference/api/
```

The generated reference is exact. The concept/how-to pages explain why and when to use it.

## First migration set

Do not migrate the entire repository first. Create these pages as proof of the system:

```text
get-started/build-your-first-store.md
get-started/local-development.md
how-to/seed-a-commerce-demo.md
how-to/verify-a-checkout.md
concepts/system-overview.md
concepts/evidence-and-provenance.md
concepts/machines-and-xstate.md
architecture/package-boundaries.md
architecture/extension-lifecycle.md
decisions/ADR-0001-domain-vs-extension.md
decisions/ADR-0002-xstate-transition-authority.md
decisions/ADR-0005-evidence-provenance-kernel.md
reference/api/evidence.md
reference/seed-profiles.md
operations/local-stack.md
operations/troubleshooting.md
```

## What will change in the repository

### New files

```text
docs-site/
package.json
docusaurus.config.ts
sidebars.ts
docs-site/docs/**
docs-site/static/**
```

### Root package changes

```text
package.json
  docs:dev
  docs:build
  docs:serve
```

Potentially:

```text
.gitignore
  docs-site/.docusaurus/
  docs-site/build/
```

### Existing files that should not be moved

```text
docs/2026-*/**/*.md
docs/archive/**/*.md
docs/product/**/*.md
```

They remain historical/reference source material. New site pages may link to them or cite them in frontmatter.

### Existing files that should be updated only after the site exists

```text
docs/README.md
README.md
CONTRIBUTING.md
```

These should point readers to the new site and to the current roadmap, not duplicate the entire navigation tree.

## Quality gates

Before a page becomes part of the current navigation:

- It has page-type metadata.
- It has an owner.
- It has a last-verified date.
- It links to current code or tests for implementation claims.
- It distinguishes current, historical, and planned behavior.
- It has no broken internal links.
- A tutorial or how-to has a reproducible verification step.
- A reference page has a source contract.
- An ADR has a status and consequence section.

## Recommended implementation sequence

```text
1. Create docs-site with Docusaurus.
2. Add the four Diátaxis sections and sidebar navigation.
3. Add the first 12–16 critical pages.
4. Copy accepted decisions into ADRs with source provenance.
5. Add generated or curated API reference.
6. Add history navigation for dated records and audit reports.
7. Add link checking and metadata checks in CI.
8. Update repository READMEs to point to the docs site.
9. Migrate additional pages based on actual reader needs.
```

## Final boundary

The new documentation site is a curated current interface over the repository. It is not a replacement for the historical `docs/` record.

```text
old dated docs  = preserved evidence and history
new docs site    = professional current learning/reference experience
source code      = implementation truth
ADR pages        = current architectural decisions
roadmap          = current planning authority
```
