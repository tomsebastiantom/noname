# Domain boundaries — the ones that look alike

> **Status:** boundary record · **Date:** 2026-11-14
> **Why this file exists:** three pairs of domains look like duplication from the outside. They are not, but the line
> between them was only in people's heads. Written down so the next feature does not add a fourth mechanism.

---

## 1. `notifications` vs `integrations`

They both "send something to a third party", which is why they read as duplicates.

| | **integrations** | **notifications** |
|---|---|---|
| Answers | *can we talk to this provider, and with which credentials?* | *what did we decide to send, and did it arrive?* |
| Owns | provider catalogue, OAuth connections, per-org comms/LLM provider config, provider event receipts | delivery records, inbox items, delivery events, notification preferences |
| Tables | `provider_event_receipts`, `integrations_*` config | `comms_deliveries`, `comms_inbox_items`, `comms_delivery_events`, `notification*` |
| Routes | `GET/PUT /:orgId/comms` (config), LLM routes, Nango routes | `GET/PUT /preferences`, `GET /deliveries`, `POST /deliveries/:id/retry`, `GET /inbox`, `POST /inbox/:id/read` |
| Queue | `{provider-events}`, `{extension-delivery}` | `{email-outbound}` |
| Reads secrets via | `secrets.resolveCommsCredentials` / `resolveLLMProvider` | `secrets.resolveCommsCredentials` (passed in) |

**The rule:**

> **integrations** decides *whether and how* a provider can be used; **notifications** records *what was sent and what
> happened*. Credentials come from `secrets` in both cases — neither domain stores keys.

Practical test, the same one used for the tenant split: if you deleted `notifications`, could `integrations` still
compile and serve provider configuration? **Yes.** If you deleted `integrations`, could `notifications` send? **No — it
would have no credentials to send with.** That asymmetry is why they are separate and why `notifications` declares the
dependency (`NotificationsDomainDeps.secrets`), not the other way round.

**What must not happen** (the duplication this note is meant to prevent):

- `integrations` growing a delivery table "because it already knows the provider";
- `notifications` growing provider-specific HTTP calls instead of going through `integrations`' proxy;
- two retry mechanisms — `notifications` owns retry for deliveries, `integrations` owns receipt/claim for inbound
  provider events, and neither should retry the other's work.

## 2. `secrets` vs `platform-credentials` vs `integrations` — "credentials" means three things

| Domain | Owns | Never |
|---|---|---|
| `secrets` | **retrieval**: per-org API keys from Vault (`resolveLLMProvider`, `resolveCommsCredentials`) | an audit history, or a copy of the value |
| `platform-credentials` | **the record of platform identities**: who holds `platform_operator`, when a key was issued/revoked, and drift vs ZITADEL | any secret material — only ids and hashes |
| `integrations` | **which provider an org configured**, not the key itself | storage of the key value (it resolves through `secrets`) |

Rule: **a value lives in Vault; a fact about the value lives in the audit stream; the choice of provider lives in
integrations.** If a feature needs a key, it asks `secrets`; it must never read a config row and expect the key there.

## 3. Watch items (not problems yet)

| Item | Why it is on the list |
|---|---|
| ~~`domains/edge`~~ | **Resolved: it stays in the server.** Investigated 2026-11-14 — see below. |
| `capabilities` | a fourth vocabulary for "callable thing", beside agent tools and extension actions. Fine today; if a fifth appears, consolidate. |
| `tenant` (data plane) vs `tenant-registry` (control plane) | deliberate split, confusing names; `tenant` serves visitors, `tenant-registry` holds records and creation. |

### `edge` — why it is server code, not worker code

The earlier note said "9 files the worker uses, belongs beside `packages/workers`". That was wrong, and the check was
cheap:

```
importers inside packages/server/src     bootstrap.ts (mounts it at /api/edge)
importers inside packages/workers/src    none — the worker calls it over HTTP:
                                         GET ${API_ORIGIN}/api/edge/schema/:siteId
```

So the code **runs in the API** and resolves layout, content, audiences, flags and page tree out of Postgres. The
worker is a *client* of it, one HTTP hop away, because a Cloudflare Worker has no database driver here.

Moving it into `packages/workers` would put four domain services and a Postgres connection inside the edge runtime.
The delete test passes (the worker still compiles, since it only knows a URL), but the **arrow test** is the one that
matters: the dependency is `worker → API over HTTP`, and code follows the data. No change.

## 4. How to check a new boundary without a meeting

Ask these three questions of any proposed domain:

1. **Delete test** — would the others still compile? If yes, it is a real boundary.
2. **Arrow test** — does the dependency point one way? (`provisioning → registry` yes; `ai-generation → agent` was no, and
   was fixed.)
3. **Verb test** — is it a noun (aggregate) or a capability? A verb ("provisioning", "generation") belongs *inside* the
   aggregate it acts on, or as a capability consumed by several — never as a peer of the thing it changes.
