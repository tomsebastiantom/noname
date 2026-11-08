# D3 — Channels and canary rollout

> **Status:** implemented · **Date:** 2026-11-07 (America/Toronto)
> **Decision:** option B — a **release-domain channel table**, with the tenant pointer storing a channel.
> **Reuses:** D1 pointer + catalog projection, D14 release records, D16 migration gate, Evidence.
> **Related:** [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md) D3 · [`RELEASE-D1-DESIGN.md`](./RELEASE-D1-DESIGN.md) · [`RELEASE-VERIFICATION-LOG.md`](./RELEASE-VERIFICATION-LOG.md)

---

## 1. The model

```
release_channels:        (org, "canary") → r_17, previous r_16
tenant_release_pointers: org 3966… → channel = "canary"
catalog read:            channel → release → client_bundle URL
```

- `release_channels` is owned by `domains/release`, one row per `(org, channel)`.
- The tenant pointer gains a nullable `channel`. **When set, it wins over `releaseId`** on read.
  Existing pointers keep `channel = null`, so nothing breaks.
- Moving the ring is **one row**: `UPDATE release_channels SET release_id = 'r_17', previous_release_id = 'r_16'`.
  Every tenant in the channel follows on the next catalog read, with no per-tenant writes.
- The pointer’s `releaseId` stays as the **pin** used when the channel is cleared; it is not updated by a channel
  move, so clearing the channel returns the tenant to its pinned release.

## 2. Promote and rollback

`ChannelService.activate(org, channel, releaseId, actor)`:

1. release must exist and be `ready` (same rule as the pointer);
2. `assertMigrationsPromotable(release)` (D16) — a destructive migration set blocks the whole ring;
3. idempotent when the channel already points at that release;
4. one write: `releaseId`, `previousReleaseId = old releaseId`;
5. Evidence `platform.release.channel_moved` (`channel`, `from`, `to`, `actor`, `rollback`).

`rollback(org, channel, actor)` swaps active/previous, same evidence with `rollback: true`.

## 3. Tenant assignment

- `POST /api/releases/pointer/channel { channel }` — puts the tenant in a ring. The channel must exist; the
  pointer’s `releaseId` is set to the channel’s current release so the pin is meaningful if the channel is later
  cleared.
- `DELETE /api/releases/pointer/channel` — removes the tenant from the ring; the pointer keeps its current
  `releaseId` and is pinned there.
- A direct `POST /:id/promote` clears the channel: a tenant-specific promotion is an explicit pin.

## 4. Catalog projection

`ReleasePointerService.clientBundle(orgId)`:

```
pointer.channel ? channel.releaseId : pointer.releaseId
```

Then the existing release → `client_bundle` artifact lookup. No tenant-domain change; the catalog already calls
this service through `clientBundle`.

## 5. Retention

`prune` protects every release referenced by a channel (active or previous), in addition to pointers and
environments. Otherwise a ring could be moved onto a release that was just pruned.

## 6. API

| Route | Purpose |
|---|---|
| `GET /api/releases/channels` | list rings |
| `POST /api/releases/channels/:channel/activate` `{ releaseId }` | move a ring |
| `POST /api/releases/channels/:channel/rollback` | roll a ring back |
| `POST /api/releases/pointer/channel` `{ channel }` | put the tenant in a ring |
| `DELETE /api/releases/pointer/channel` | pin the tenant to its current release |

Permissions: `RELEASES_READ` for GET, `RELEASES_WRITE` for mutations.

## 7. Non-breaking migration

- new table `release_channels`, unique `(org_id, channel)`;
- `tenant_release_pointers.channel` nullable;
- no backfill; existing pointers remain pinned (`channel` null).

## 8. Verification

| Check | Expected |
|---|---|
| Unit — channel move | ready-only, idempotent, previous set, Evidence written |
| Unit — destructive ring | `assertMigrationsPromotable` throws, no write |
| Unit — pointer resolution | channel release wins; clearing returns the pinned release |
| Unit — retention | a channel-referenced release is not pruned |
| Live | two ready releases; move ring; catalog URL follows without touching the pointer; rollback restores |
| Live — Evidence | one `platform.release.channel_moved` per real move |

## 9. Limits

- Channels are tenant rings, not percentage traffic splitting; a request never sees two bundles.
- No UI yet; the API is the interface.
- A channel move is one write but the catalog re-reads the pointer per request (same as D1).
