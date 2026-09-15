---
title: The visual builder
sidebar_position: 6
status: current-and-evolving
owner: client/editor
last_verified: 2026-09-14
audience: [builder, contributor, agent]
---

# The visual builder

The visual builder is the user-facing surface for shaping a document and its layout specification while keeping the rendered product visible.

## What a user can do

```text
open page
  → inspect canvas and layer tree
  → select a catalog component
  → edit schema-backed props
  → drag/reorder or mutate layout
  → preview the result
  → save or review the draft
```

## What the agent can do beside the user

The agent should work against the same document/spec context, not create an unrelated hidden implementation.

```text
user selects a section
  → user asks for a change
  → agent reads page/spec context
  → agent proposes a structured patch
  → user sees the diff and explanation
  → user accepts, edits, or rejects
  → builder renders the approved result
```

## Current client areas

```text
packages/client/src/editor/components/canvas
packages/client/src/editor/components/layers
packages/client/src/editor/components/panel
packages/client/src/editor/components/palette
packages/client/src/editor/components/agent
packages/client/src/editor/hooks
packages/client/src/editor/collab
```

## Collaboration

The editor supports presence and shared layout/spec collaboration. The user should be able to distinguish local draft state, remote collaborator changes, and an agent proposal.

## Design rules

- The canvas is the product surface, not a detached form.
- The spec is inspectable and serializable.
- Component editing uses registered schemas and metadata.
- Agent changes are reviewable before they become the user's document.
- Permission and tenant scope apply to editing and agent actions.

## Related

- [Documents and layouts](./documents-and-layouts)
- [How people and agents build together](./human-agent-loop)
- [Extension lifecycle](../architecture/extension-lifecycle)
