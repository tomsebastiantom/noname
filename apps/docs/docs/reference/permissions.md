---
title: Permissions reference
sidebar_position: 3
status: current
owner: auth
last_verified: 2026-09-14
source_paths:
  - packages/auth
  - packages/server/src/domains/auth
---

# Permissions reference

Permissions are tenant-aware and enforced through the platform identity and authorization boundaries. Domain UI should request generic permission/catalog capabilities rather than reimplementing authorization logic.

For exact relationship and provider configuration, use the current auth package and environment configuration. Historical permissions plans remain in the repository history section.
