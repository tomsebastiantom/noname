# E3-spike report — Automerge vs Loro

> **Status:** Complete (offline spike; code removed after doc capture)

**Ran:** 2026-08-06T14:57:51.442Z

## PASS/FAIL matrix

| Scenario | Fixture | Automerge | Loro | validateSpec |
|----------|---------|-----------|------|--------------|
| concurrent_prop_edit | commerce | PASS | PASS | PASS |
| reorder_children | commerce | PASS | PASS | PASS |
| add_delete_element | home | PASS | PASS | PASS |

## Merge timing (ms)

| Scenario | Automerge | Loro |
|----------|-----------|------|
| concurrent_prop_edit | 34.99 | 21.13 |
| reorder_children | 5.90 | 3.61 |
| add_delete_element | 3.53 | 2.63 |

## Doc size after 50 sequential prop edits (commerce hero title)

- Automerge: **1803** bytes
- Loro: **2522** bytes

## E3-pre patch replay vs CRDT convergence

| Scenario | CRDT (both libs) | Ordered replay matches golden | Notes |
|----------|------------------|-------------------------------|-------|
| concurrent_prop_edit | PASS | YES | — |
| reorder_children | PASS | NO | ordered patch replay diverges from sequential solo-edit golden; CRDT converges where naive same-base patch replay does not |
| add_delete_element | PASS | YES | — |

## Recommendation for E3a

- **Primary:** automerge
- **Fallback:** loro

### Rationale

- Automerge scenarios passed 3/3; Loro 3/3.
- 50-edit snapshot size: Automerge 1803 bytes, Loro 2522 bytes.
- Both libraries passed reorder+add; Loro MovableList is nicer for DnD but Automerge list ops work.

### E3a schema mapping notes

- Mirror spec.root (scalar) + spec.elements (map) — never whole-row Postgres in CRDT.
- Automerge: use deleteAt/insertAt/push on children arrays — avoid assigning children = [...] during live collab.
- Loro: spec.elements as LoroMap; each element.children as LoroMovableList; props/labels as nested LoroMap.
- Publish boundary unchanged: export CRDT → validateSpec → full spec replace.
- E3-pre patch log remains audit trail; CRDT is live path — replay patches for offline/sync fallback only.

## Surprises / failures

- None — all scenarios passed on both libraries.

## How this was produced

Offline spike (Aug 2026): real `home` + `commerce` seed specs, four scenarios (concurrent props, reorder+add, add+delete, `validateSpec` on export). Compared Automerge vs Loro merge and E3-pre `replaySpecPatches` from `document-op-payload.ts`. Spike script lived under `packages/server/.../collab-spike/` during the run; removed after this report was captured.

Handoff spec: [`E3-SPIKE-HANDOFF.md`](./E3-SPIKE-HANDOFF.md)
