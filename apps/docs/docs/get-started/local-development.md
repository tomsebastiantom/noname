---
title: Local development
sidebar_position: 2
status: current
owner: platform
last_verified: 2026-09-14
audience: [contributor]
---

# Local development

> **How-to guide** · Start here when working on the repository.

## Prerequisites

- Node.js 20 or newer
- pnpm
- Podman and Podman Compose
- A checkout of the repository

## Install dependencies

```bash
pnpm install
```

## Start infrastructure

Start the repository's local Postgres, Redis, and supporting services using the project compose workflow.

## Run the API

```bash
pnpm dev
```

The server development command is the main local API entry point. The client and edge workflows are documented in the repository's operational records until they are added to this site.

## Run checks

```bash
pnpm exec biome check .
pnpm test
pnpm build
```

## Useful seed commands

```bash
pnpm seed:demo
pnpm seed:demo:commerce
pnpm seed:demo:full
```

## Understand the repository

- `packages/server` — generic API domains and persistence ports
- `packages/verticals` — business capabilities and vertical semantics
- `packages/extensions` — extension-owned UI and actions
- `packages/client` — generic admin/editor shell
- `packages/seeding` — deterministic environment profiles
- `packages/fixtures` — pure shared fixture data
