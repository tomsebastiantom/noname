---
title: Evidence API
sidebar_position: 1
status: current
owner: server/evidence
last_verified: 2026-09-14
source_paths:
  - packages/server/src/domains/evidence
---

# Evidence API

> Current generic read contract. OpenAPI generation will replace hand-maintained request/response details when the route schema export is available.

## GET `/api/evidence/records`

List immutable Evidence records visible to the authenticated organization.

### Query parameters

| Parameter | Required | Description |
|---|---:|---|
| `type` | No | Evidence type, for example `commerce.order.created` |
| `subjectId` | No | Subject identifier filter |
| `limit` | No | Page size |

### Example

```bash
curl 'http://localhost:3000/api/evidence/records?type=commerce.order.created&limit=50' \
  -H 'Authorization: Bearer <token>'
```

## GET `/api/evidence/links/:recordId`

Read typed links associated with a record.

## GET `/api/evidence/audit`

Read generic audit information for Evidence records.

## Errors

- `401` — missing or invalid authentication
- `403` — organization access denied
- `400` — invalid query parameters

For the implementation source and tests, see `packages/server/src/domains/evidence`.
