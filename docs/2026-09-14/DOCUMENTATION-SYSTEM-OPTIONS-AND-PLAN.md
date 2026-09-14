# Noname Documentation System — Options and Recommended Plan

Date: 2026-09-14
Status: Documentation architecture decision proposal

## Executive decision

Noname should move from a flat dated-document collection to a professional docs-as-code system with four deliberate layers:

```text
public product docs
  what Noname is and how users build with it

developer guides
  how contributors extend, operate, and integrate Noname

architecture and decisions
  why boundaries and technical choices exist

reference
  generated APIs, packages, schemas, routes, permissions, and configuration
```

Recommended implementation:

```text
Docusaurus or equivalent MDX documentation site
+ Diátaxis-style information architecture
+ OpenAPI-generated HTTP reference
+ generated package/type reference where useful
+ ADRs for binding architecture decisions
+ dated implementation records retained as history
+ one code-audited current status/roadmap document
+ CI link/metadata/staleness checks
```

Do not start by moving every Markdown file into a new folder. First define the information architecture and source-of-truth rules, then migrate the pages that users and contributors actually need.

## What the current audit tells us

The repository has valuable documentation, but it currently mixes several document types in one dated tree:

- product positioning
- tutorials and manual verification
- architecture decisions
- implementation plans
- incident reports
- test-run evidence
- stale status snapshots
- future research
- generated audit reports
- API and package references

The complete audit is indexed in:

```text
docs/2026-09-14/DOCUMENTATION-AUDIT-INDEX.md
```

The current implementation authority is:

```text
docs/2026-09-14/AUTHORITATIVE-ROADMAP-CURRENT.md
```

The problem is not that the historical documents exist. The problem is that a reader cannot immediately tell whether a page is:

```text
current implementation
historical evidence
design proposal
how-to guide
API reference
product aspiration
```

The new system must make that distinction structural, not dependent on a reader noticing a date.

## Documentation platform options

### Option A — Continue with repository Markdown only

```text
docs/
  current/
  architecture/
  guides/
  reference/
  history/
```

Use GitHub/GitLab rendering and folder navigation as the docs UI.

#### Advantages

- No new website dependency
- Lowest implementation cost
- Works offline and in pull requests
- Easy contribution workflow
- No hosting or build pipeline required
- Markdown remains portable

#### Disadvantages

- Weak navigation and search
- No polished public-docs experience
- No version selector
- API reference is difficult to browse
- Cross-links and metadata are easy to break
- Readers see repository structure rather than a product documentation experience
- Difficult to separate public, contributor, and internal documentation cleanly

#### Appropriate when

- The primary audience is repository contributors
- Documentation is internal
- A docs website is not yet a product requirement

### Option B — Docusaurus or an equivalent docs-as-code site

```text
apps/docs/
  docs/
  blog/
  sidebars.ts
  docusaurus.config.ts
```

The repository remains the source of truth, but Markdown/MDX is built into a professional site.

#### Advantages

- Excellent navigation and search
- Versioning is available when the public API stabilizes
- MDX supports diagrams, tabs, callouts, code blocks, and interactive examples
- Pull-request review remains normal Git workflow
- Can publish public and internal sections separately
- Strong fit for architecture, guides, and product documentation
- Portable and self-hostable

#### Disadvantages

- Adds a docs build and deployment pipeline
- Requires information architecture discipline
- MDX can become coupled to the chosen renderer
- Generated API reference needs a separate pipeline
- Versioning too early can multiply maintenance work

#### Appropriate when

- Noname needs public open-source-quality documentation
- The team wants docs reviewed with code
- Product, contributor, and API audiences need a coherent site

### Option C — Hosted documentation platform

Examples include Mintlify, ReadMe, GitBook, or similar hosted products.

#### Advantages

- Fast polished presentation
- Search, navigation, analytics, and feedback are built in
- OpenAPI import is often straightforward
- Low initial frontend/apps/docs maintenance
- Useful for external developer portals

#### Disadvantages

- Vendor and pricing dependency
- Less control over routing, versioning, and custom behavior
- Private/internal docs may require plan-specific access controls
- Documentation content can drift from the monorepo unless CI publishing is strong
- Migration away from the vendor can be expensive
- Architecture decisions and long-form engineering history are often less natural than in Git

#### Appropriate when

- Public API documentation is the primary goal
- Speed to a hosted developer portal matters more than repository ownership
- The organization accepts a hosted vendor boundary

### Option D — Generated reference portal plus curated guides

```text
curated MDX guides
+ OpenAPI reference
+ TypeDoc/package reference
+ schema/catalog reference
```

This can be implemented inside Docusaurus or a hosted system.

#### Advantages

- Strongest separation between human explanation and machine-generated reference
- API paths, request schemas, and response schemas are less likely to become stale
- Package contracts can be discovered from source types
- Good fit for Noname's generic APIs, extension APIs, machine definitions, Evidence, and catalog schemas
- Scales well as more verticals and providers are added

#### Disadvantages

- Generated output can be technically correct but hard to learn from
- Requires stable OpenAPI/type metadata
- Build failures can block docs publication
- Generated docs do not replace architecture or product explanations

#### Appropriate when

- Noname is becoming an open-source platform
- External extension authors need dependable contracts
- API and package surfaces are growing

## Recommendation

Use **Option B plus Option D**:

```text
Docusaurus/MDX docs-as-code site
  ├─ curated product/concept/how-to/reference pages
  ├─ generated OpenAPI HTTP reference
  ├─ generated package/extension reference where valuable
  ├─ ADRs and architecture decisions
  └─ historical implementation archive
```

Keep the current `docs/` tree as the migration source. Do not delete the dated history. Migrate pages into stable navigation paths and retain the original path as a historical link where necessary.

Avoid Option C initially because Noname's architecture, extension boundaries, and open-source contribution model benefit from repository ownership. A hosted portal can be reconsidered later for a public API mirror.

## Proposed information architecture

```text
docs/
  README.md                         documentation home and authority rules
  product/
    overview.md                     what Noname is
    use-cases.md                    merchant, contributor, extension author journeys
    capabilities.md                 current product capabilities only
    roadmap.md                      current roadmap link/view

  get-started/
    local-development.md
    first-store.md
    first-commerce-checkout.md
    first-extension.md

  concepts/
    platform-model.md
    tenant-and-store-identity.md
    documents-and-layouts.md
    spec-driven-ui.md
    catalog-and-extensions.md
    machines-and-xstate.md
    capabilities-and-public-access.md
    evidence-and-provenance.md
    integrations-and-nango.md
    analytics-and-replay.md

  guides/
    create-a-layout.md
    create-a-content-type.md
    create-an-extension.md
    add-a-commerce-component.md
    add-a-machine-definition.md
    add-a-provider-adapter.md
    seed-a-demo-environment.md
    verify-a-checkout.md
    add-a-permission.md
    run-browser-mcp-verification.md

  architecture/
    system-overview.md
    package-boundaries.md
    request-and-data-flow.md
    tenant-isolation.md
    public-access-security.md
    extension-lifecycle.md
    worker-and-edge-architecture.md
    persistence-and-events.md

  decisions/
    ADR-0001-domain-vs-extension.md
    ADR-0002-xstate-as-transition-authority.md
    ADR-0003-generic-capability-routes.md
    ADR-0004-nango-provider-boundary.md
    ADR-0005-evidence-provenance-kernel.md
    ADR-0006-commerce-ui-ownership.md
    ADR-0007-seeding-and-fixture-boundaries.md

  reference/
    api/
      overview.md
      openapi.json                generated or checked-in artifact
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
    worker-deployment.md
    cloudflare-deployment.md
    observability.md
    troubleshooting.md

  history/
    2026-09-14/
      implementation-records/
      audit-reports/
      verification-runs/
```

The exact filesystem can differ, but the navigation categories should remain stable.

## Page types and professional templates

### Product overview page

```markdown
# Product Overview

> Status: current | Last verified: YYYY-MM-DD

## What it does
## Who it is for
## Current capabilities
## What is not implemented
## Core user journey
## Architecture at a glance
## Next steps
## Related guides
```

Rules:

- Do not describe aspirational features as shipped.
- Link every current capability to source or verification evidence.
- Keep marketing claims separate from implementation status.

### Concept page

```markdown
# Evidence and Provenance

> Status: current | Owner: server/evidence | Last verified: YYYY-MM-DD

## Problem
## Mental model
## Core entities
## Request/data flow
## Ownership boundaries
## Security constraints
## Example
## Failure modes
## Related API reference
## Related ADRs
```

Concept pages explain the system without requiring the reader to reconstruct it from implementation files.

### How-to guide

```markdown
# Add a Commerce Extension Component

> Audience: extension authors
> Time: 15 minutes
> Prerequisites: local stack and seeded tenant

## Goal
## Prerequisites
## Steps
## Verify
## Common failures
## Next steps
```

A how-to must end with a reproducible verification step.

### Tutorial

```markdown
# Build Your First Noname Store

## What you will build
## Step 1: start the stack
## Step 2: seed a tenant
## Step 3: publish content
## Step 4: add a Commerce component
## Step 5: test checkout
## What happened
## Where to go next
```

Tutorials should be linear and tested from a clean environment. Do not use them as architecture references.

### API reference page

```markdown
# POST /api/capabilities/commerce.checkout

> Generated from OpenAPI/schema source where possible

## Purpose
## Authentication
## Headers
## Request schema
## Response schema
## Errors
## Idempotency behavior
## Example
## Related concepts
```

Generated reference should provide the exact contract. Human-written pages should explain why and when to use it.

### Architecture decision record

```markdown
# ADR-000X: Decision title

- Status: proposed | accepted | superseded | rejected
- Date:
- Owners:
- Supersedes:
- Superseded by:

## Context
## Decision
## Alternatives considered
## Consequences
## Implementation evidence
## Revisit conditions
```

An ADR records one decision. It is not a general status report or an implementation diary.

### Implementation record

```markdown
# Checkout Reliability Implementation

> Historical implementation record
> Date:
> Commits:
> Current status: link to authoritative roadmap

## Scope
## Changes
## Tests
## Live verification
## Known limitations at the time
## Follow-up
```

Implementation records should remain dated and should never be used as the current roadmap without explicit reconciliation.

## Source-of-truth rules

| Information | Source of truth |
|---|---|
| Current implementation status | `AUTHORITATIVE-ROADMAP-CURRENT.md` plus current source/tests |
| HTTP contract | OpenAPI/schema source and generated API reference |
| Architecture decision | Accepted ADR and current code evidence |
| Package API | Package source/types and generated reference |
| Product aspiration | Product docs, explicitly labeled aspiration |
| Historical test result | Dated verification record |
| Seed behavior | `packages/seeding` profiles and seed docs |
| Shared fixture behavior | `packages/fixtures` and fixture docs |
| Current permissions | `packages/auth` and generated/reference permission page |
| Deployment behavior | Operations docs plus deployment configuration |

No page may claim “implemented” without one of:

- current source path
- passing test path
- live verification record
- deployment evidence

## Current documentation pages to build first

The first professional migration should cover the critical path, not every historical file.

### 1. Getting started

```text
local-development.md
first-store.md
first-commerce-checkout.md
```

### 2. Architecture

```text
system-overview.md
package-boundaries.md
tenant-and-store-identity.md
extension-lifecycle.md
```

### 3. Core concepts

```text
documents-and-layouts.md
spec-driven-ui.md
machines-and-xstate.md
capabilities-and-public-access.md
evidence-and-provenance.md
```

### 4. Extension authors

```text
create-an-extension.md
add-a-commerce-component.md
add-a-machine-definition.md
add-a-provider-adapter.md
```

### 5. Operations

```text
local-stack.md
nango-setup.md
seed-a-demo-environment.md
verify-a-checkout.md
cloudflare-deployment.md
troubleshooting.md
```

### 6. Reference

```text
api/overview.md
api/capabilities.md
api/machines.md
api/evidence.md
permissions.md
seed-profiles.md
```

## Migration options

### Conservative migration

Keep all files where they are, add status/frontmatter, and create a generated navigation index.

Best when:

- The team cannot adopt a docs website yet.
- History must remain untouched.
- The immediate problem is discoverability.

### Structured repository migration

Move current pages into `product`, `concepts`, `guides`, `architecture`, `reference`, and `operations`, while retaining dated history under `history`.

Best when:

- GitHub-rendered Markdown is sufficient.
- The project wants clearer ownership quickly.
- A docs site can come later.

### Full docs site migration

Build Docusaurus/MDX navigation and migrate the critical pages first. Keep historical reports available under an archive section.

Best when:

- Noname is becoming a public open-source platform.
- Extension authors and external developers are target users.
- Search, versioning, API reference, and polished navigation matter.

## Recommended implementation sequence

```text
1. Adopt this information architecture and page metadata.
2. Keep dated documents as history; stop adding new dated status pages.
3. Build the critical current pages: getting started, architecture, concepts, operations.
4. Add ADR-0001 through ADR-0007 from already accepted decisions.
5. Define or export OpenAPI for generic routes and generate API reference pages.
6. Add package/extension reference only for stable public contracts.
7. Add apps/docs navigation and search.
8. Add CI checks for broken links, missing status/owner metadata, and stale verification dates.
9. Add versioning only when public API compatibility requires it.
```

## External evidence

The recommended page taxonomy follows [Diátaxis](https://diataxis.fr/), which separates documentation into tutorials, how-to guides, technical reference, and explanation. This matches Noname's need to distinguish learning a workflow, completing a task, looking up an exact contract, and understanding architecture.

## Final recommendation

Choose:

```text
Docusaurus/MDX
+ Diátaxis-style page types
+ generated API reference
+ ADRs
+ dated history archive
+ code-audited current roadmap
```

The next implementation should be the documentation system and critical-path pages, not another broad audit or another flat dated status document.
