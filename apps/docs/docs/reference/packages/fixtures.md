---
title: Fixtures package
sidebar_position: 2
status: current
owner: testing
last_verified: 2026-09-14
source_paths:
  - packages/fixtures
---

# Fixtures package

Package: `@noname/fixtures`

The package contains pure shared fixture data and builders that can be consumed by seed profiles and domain tests without making server tests depend on seed implementation.

Current exported fixture area:

```text
@noname/fixtures/notifications
```

Domain-specific mocks and test doubles remain local to their owning domain.
