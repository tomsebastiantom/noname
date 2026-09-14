---
title: Package boundaries
sidebar_position: 1
status: current
owner: platform
last_verified: 2026-09-14
audience: [contributor, architect]
---

# Package boundaries

Noname keeps generic platform capability separate from vertical business semantics and extension-owned presentation.

## Current boundary

```text
packages/server/src/domains
  generic machines, capabilities, integrations, Evidence, documents, auth, persistence ports

packages/verticals/src/commerce
  Commerce capabilities, checkout mappings, order projection, provider-neutral semantics

packages/extensions/src/commerce
  Commerce components, actions, catalog schemas, cart UI, Orders admin UI

packages/client
  generic admin/editor shell, routes, permissions, catalog loading

packages/seeding
  profile orchestration

packages/fixtures
  pure shared fixture data
```

## Ownership rule

Do not add Commerce-specific behavior to a generic server domain merely because an older document proposed a Commerce server branch. Put business meaning in the Commerce vertical and Commerce UI/actions in the Commerce extension.

## Benefits

- Generic APIs remain reusable by other verticals.
- Commerce can evolve without bloating platform core.
- Tests can target ownership boundaries.
- Extensions can register behavior through stable integration points.

- [Create an extension](../how-to/create-an-extension)
- [Commerce UI ownership ADR](../decisions/ADR-0006-commerce-ui-ownership)
