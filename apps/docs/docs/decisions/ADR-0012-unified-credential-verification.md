---
title: ADR-0012 — Unified credential verification and the signed session token
sidebar_position: 12
status: proposed
owner: auth and platform
recorded: 2026-10-10
last_verified: 2026-10-10
source_documents:
  - docs/2026-10-10/architecture-audit/05-SCALABILITY-SECURITY-RUNTIME.md
  - docs/2026-08-23/SSE-AUTH-ISSUES-ROOT-CAUSES.md
implementation_evidence:
  - packages/auth/src/jwt/verify.ts
  - packages/server/src/domains/auth/verified-token.ts
  - packages/server/src/domains/auth/adapters/zitadel/jwks.ts
  - packages/server/src/shared/agent-token.ts
---

# ADR-0012: Unified credential verification and the signed session token

- **Status:** proposed
- **Date:** 2026-10-10
- **Supersedes/extends:** [ADR-0004](ADR-0004-identity-and-tenant-boundary)

## Context

The platform now presents six credential types through five independent verification mechanisms, and they were built one at a time without a shared rule for who verifies what.

| Credential | Principal | Format | Minted by | Verified by | TTL | Replay protection |
|---|---|---|---|---|---|---|
| Access token | human user | ZITADEL OIDC JWT (RS256) | ZITADEL | edge JWKS, and since `646b90e` the origin JWKS | ZITADEL | `exp` |
| Agent token | agent | HMAC token `nag.<b64url json>.<sig>` | API server | `timingSafeEqual` in `shared/agent-token.ts` | `exp` claim | `exp` |
| Stream ticket | SSE client (notifications, flags) | HMAC `{userId, orgId, exp}` | API server | `notifications/stream-ticket.ts` | 60 s | `exp` |
| Collab ticket | editor (layout, rich text) | HMAC | API server | `collab/collab-ticket.ts`, `richtext-collab-ticket.ts` | short | `exp` |
| Publishable key | anonymous storefront | opaque per-tenant string | API server | `timingSafeEqual` vs tenant setting | none | none |
| Edge HMAC headers | edge → origin | `orgId:userId:role` | edge worker | `shared/org.ts` `orgMiddleware` | none | **none** |

Three concrete problems follow from this shape.

**1. Transit was mistaken for authenticity.** Until `646b90e`, the origin derived identity, roles, and permissions from an unverified JWT payload (`packages/auth/src/jwt/decode.ts:13`, whose own comment read *"no signature verification — trust edge/API gateway"*). Meanwhile the edge deliberately skipped validation on public routes and stream-ticket bypasses *while still forwarding the caller's credential* (`workers/src/routes/proxy.ts:167-175`), signing the HMAC with an **empty** user id and role (`:145`). A valid HMAC therefore proved only that a request had transited the edge, not that its identity was real. A token carrying the `urn:zitadel:iam:org:projects:roles` admin claim satisfied permission checks on `POST /api/capabilities/*`, where the tenant org comes from the `Host` header.

The origin now verifies signatures itself (`verified-token.ts`), which closes the hole. But the underlying design gap remains: **nothing states which layer must verify which credential.**

**2. One symmetric secret has five unrelated jobs.** `WORKER_SERVER_SECRET` is read for:

- edge → origin request signing and verification (`workers/src/hmac.ts:28`, `shared/org.ts:21,24`)
- notifications SSE stream tickets (`notifications/stream-ticket.ts:13`)
- flags SSE stream tickets — the same minter, reused (`flags/routes/stream.ts:6,21`)
- layout collab tickets (`collab/collab-ticket.ts:21`)
- rich-text collab tickets (`collab/richtext-collab-ticket.ts:18`)

Leaking it compromises every one of those boundaries at once, and rotation requires a lockstep redeploy of the edge and all API replicas. Agent tokens correctly use a separate `AGENT_TOKEN_SECRET`, which shows the split is understood but was only applied once.

**3. Ticket scope is not bound to a purpose.** `verifyStreamTicket` validates signature and `exp` only. The flags SSE endpoint mints a ticket with `userId: ""` (`flags/routes/stream.ts:21`), and the notifications endpoint accepts any ticket passing the same verifier, including one minted for flags. Impact today is low — an empty user id subscribes to no one's inbox — but the missing audience claim is exactly the class of gap that produced item 1.

Two smaller observations belong here as well. The edge signs a `role` claim (`workers/src/hmac.ts:27,38`) that **no production code reads**; `getRole(c)` appears only in `hmac.contract.test.ts`, and the claim carries the *primary* role only, so it is lossy for multi-role users. And `?access_token=` is accepted from the URL (`shared/…/token-service` via `resolveAccessToken`), which places credentials in browser history, referrer headers, and access logs.

## Credential ownership — who mints, who verifies, who is right

"Owner" is the component accountable for the credential's contract, following the ownership convention used elsewhere in this ADR set.

| Credential | Owner | Minted where | Verified where | Current verdict |
|---|---|---|---|---|
| Access token (OIDC JWT) | `auth` | ZITADEL, brokered by `auth/routes/login.ts`; stored client-side (`client/src/auth/session.ts:1-26`) | Edge JWKS (`workers/src/auth.ts:12-17`) **and** origin JWKS (`auth/verified-token.ts`) | **Corrected.** Was the incident; now verified at both accepting layers (`646b90e`) |
| Agent token (`nag.*`) | `agent` | API server, `agent/agent-token.ts` (`AGENT_TOKEN_SECRET`) | `shared/agent-token.ts:27-66`, called from `auth/guards.ts:61-76` | **Correct — and the reference model.** Signed, `exp`-checked, carries `orgId` + `permissions[]`, and the org is cross-checked against the edge HMAC (`guards.ts:63-66`, 403 on mismatch) |
| Stream ticket | `notifications` | `notifications/stream-ticket.ts` (`WORKER_SERVER_SECRET`, 60 s) | `verifyStreamTicket` — `notifications/routes/stream.ts:15`, `flags/routes/stream.ts:32` | **Two gaps.** No audience claim, so a ticket minted for one endpoint is accepted by the other; flags mints `userId: ""` (`flags/routes/stream.ts:21`) |
| Collab ticket | `collab` | `collab/collab-ticket.ts` (layout), `collab/richtext-collab-ticket.ts` (rich text) — both `WORKER_SERVER_SECRET`, 60 s | `verifyCollabTicket` (`collab/routes.ts:172`), `verifyRichTextCollabTicket` (`:268`) | **Best-scoped of the tickets.** Binds to `layoutDocumentId`, or `contentDocumentId + fieldKey + locale`. The room is derived from the ticket payload, so resource binding is implicit rather than checked |
| Publishable key | `documents` (tenant settings) | Stored per tenant; read via `tenantSettings.get(orgId).publishableKey` | `shared/public-actor.ts:26-40` — `timingSafeEqual`, bound to the edge-resolved org | **Correct mechanism, no lifecycle.** No expiry, rotation, or audit. Leverage is bounded to anonymous storefront reads |
| Edge HMAC headers | `platform` (`shared/org.ts`) | Edge worker, `hmac.ts:21-40` | `orgMiddleware`, `shared/org.ts:39-67` | **Load-bearing but the weakest.** No timestamp or nonce, so captured headers replay indefinitely; one secret doing five jobs; signs a `role` no production code reads; `shared/tenant.ts` is a dead, weaker duplicate that warns instead of rejecting |

The pattern this table exposes is worth stating plainly: **the two credentials the project minted for a narrow purpose (agent, collab) are the two that are right.** Both bind a principal *and* a resource, both expire. The two weakest are the two broadest — a global transit secret with no expiry and a tenant-wide key with no lifecycle. Generality and rigour moved in opposite directions.

## How the six credentials work together

Six end-to-end flows exercise all six credentials. In every flow the origin's tenant comes from the HMAC-signed `x-org-id` — never from the body, the query string, or the token.

**1. Signed-in staff call an authenticated API route**

```text
browser → Authorization: Bearer <ZITADEL JWT>
  → edge: validate JWT (JWKS) → sign HMAC(org, userId, role)
  → origin: verify HMAC (org + identity) → verify JWT → permissions
  → requireActorPermission → expandPermissions(verified roles)
```

**2. Anonymous storefront calls a public route**

```text
browser → x-publishable-key, no user credential
  → edge: no JWT to validate → sign HMAC(org, "", "")
  → origin: verify HMAC → org; requirePublicActor compares key against org
```

No user identity is involved at any point; the org is the entire authorization context.

**3. Anonymous visitor or staff calls a capability route**

```text
browser → Authorization: Bearer <jwt> (staff)   OR   x-publishable-key (visitor)
  → edge: public route; a presented credential is validated before signing
  → origin: verify HMAC → org; verify JWT → permissions; denyUnless(permission)
```

This is the flow the incident exploited. Both branches are verified now.

**4. Browser opens an SSE stream (notifications, flags)**

```text
signed-in browser → POST /stream/ticket (verified JWT) → 60 s ticket
  → GET /stream?stream_ticket=…   (EventSource cannot set headers)
  → origin: verifyStreamTicket → { userId, orgId } → subscribe
```

**5. Editor opens a collaborative session**

```text
editor → authenticated request → mintCollabTicket(userId, orgId, layoutDocumentId)
  → edge recognises the ticket → proxies the WebSocket without a JWT
  → origin: verifyCollabTicket → room derived from the ticket payload
```

**6. Agent acts on a user's behalf**

```text
agent → Authorization: Bearer nag.<payload>.<sig>
  → origin: verifyAgentToken → agentId, onBehalfOf, orgId, permissions[]
  → org cross-checked against the edge HMAC → 403 on mismatch
```

**Where the model is inconsistent.** Flows 4 and 5 are the same idea implemented twice with different scope (org-only versus resource-bound) over the same shared secret. Flow 6 already implements the target shape that D3 proposes for humans — a signed principal carrying its own permissions and expiry. Flow 1 performs the same JWKS verification twice, once per layer. And only flow 2 has no user identity at all, which is the case the audit found is already handled correctly.

## Decision proposal

**D1 — Verify at the accepting layer.** Every layer that accepts a credential verifies it. Transit through a trusted component is not evidence of validity. This is the rule the incident in Context §1 violated, and it is non-negotiable.

**D2 — One verification helper per credential class.** No component derives identity, roles, or permissions by decoding a credential directly. `verified-token.ts` is the single entry point for access tokens; ad-hoc `decodeAccessTokenPayload` use for authorization is forbidden and should be enforced by a lint rule and a test.

**D3 — Target model: a server-minted signed session token replaces JWT-as-identity at the origin.** The pattern already exists in `shared/agent-token.ts`: an HMAC-signed payload carrying `userId`, `orgId`, `permissions[]`, `iat`, `exp`, verified with `timingSafeEqual`. Applying it to human sessions means:

- the origin verifies **one** signature and never parses a JWT;
- permissions travel with the token, so the origin no longer needs the JWT to authorize (today it must, because the edge HMAC carries a single lossy `role`);
- edge and origin stop performing duplicate JWKS work;
- revocation and short-TTL refresh become explicit.

ZITADEL remains the identity provider and the sole issuer of the upstream JWT. The session token is an application-layer credential derived from it, not a replacement for OIDC.

**D4 — Split the secrets by trust boundary.** Four distinct secrets: edge→origin trust, session tokens, SSE/collab tickets, agent tokens. Existing agent tokens already follow this.

**D5 — No credentials in URLs.** `?access_token=` is deprecated in favour of the ticket mechanism for every EventSource/WebSocket path. Tickets must carry an **audience/purpose** claim (`aud: "notifications-stream" | "flags-stream" | "collab-layout" | …`) and be validated against the endpoint that receives them, with a TTL of at most 60 s.

**D6 — One permission evaluation path.** `expandPermissions` over verified role claims remains the single source of permissions; `requireActorPermission` / `denyUnless` / `requirePublicActor` remain the three accepted entry points (human-or-agent, human permission, anonymous publishable key). `x-role` is either removed from the edge HMAC payload or wired up deliberately — not left signed and unread.

## Consequences

- **Positive.** The confused-deputy class is closed structurally rather than patched; secret blast radius drops from "all boundaries" to one; permissions no longer require parsing an upstream JWT; revocation and audit improve; the `x-role` ambiguity is resolved.
- **Negative.** A new signing secret and token lifetime to operate; the session token becomes a bearer credential that must be short-lived and revocable; agents and humans converge on one token shape, so permission-model mistakes become more consequential; a migration window in which both token types are accepted.
- **Neutral.** ZITADEL's role remains unchanged; the edge still validates the upstream JWT to mint the session token, so edge verification is not removed, only relocated.

## Alternatives considered

| Option | Description | Verdict |
|---|---|---|
| **A** | Keep JWT-as-identity; verify its signature at every accepting layer (implemented in `646b90e`) | Accepted as the **interim**. Smallest correct change, closes both the header and `?access_token=` vectors today. Does not fix the secret split, the lossy `role`, or the duplicated JWKS work. |
| **B** | Have the edge validate every credential-bearing public route, then let the origin trust the HMAC | **Rejected.** Covers the header vector only — `?access_token=` lives in the URL and ticket-bypass paths skip edge validation entirely. And the HMAC carries one primary role, not a permission set, so authorization would still need the JWT. |
| **C** | Signed session token minted by the origin after edge validation (D3) | **Proposed as the target.** The only option that removes duplication while strengthening the model, and it already has precedent in `agent-token.ts`. |

## Migration outline

1. **Now (done).** Verify at the origin (option A). Regression tests cover the unsigned wildcard-role token.
2. Split `WORKER_SERVER_SECRET` into edge-trust and ticket secrets; add fingerprints to logs on both sides so mismatch is diagnosable.
3. Add `aud` to tickets and validate per endpoint; stop minting `userId: ""` flags tickets.
4. Remove `?access_token=`; require tickets on every streaming path.
5. Introduce the session token alongside the JWT; origin accepts either, preferring the session token.
6. Cut over, then delete JWT parsing from the origin's authorization path.
7. Decide `x-role`: remove it from the HMAC payload or consume it explicitly.

## Revisit conditions

Accept this ADR only when steps 1–4 are implemented and verified, and when the session-token lifetime, revocation, and refresh semantics are written down. Until then it remains a proposal, and option A stays the enforced contract.

## Open questions

- Session token lifetime and refresh: sliding window vs short access + refresh pair?
- Revocation: does a signed session token need a server-side deny list, or is a short TTL sufficient?
- Should agents and humans converge on one token shape, or remain deliberately distinct?
- Does the publishable key need rotation/expiry, and should it move to the same signed-credential machinery?

## Evidence

- Incident and interim fix: commit `646b90e`; `packages/auth/src/jwt/verify.ts`, `packages/server/src/domains/auth/verified-token.ts`, `packages/server/src/domains/auth/verified-token.test.ts`
- Precedent for the target model: `packages/server/src/shared/agent-token.ts:6-66`
- Secret reuse sites: `workers/src/hmac.ts:28`; `shared/org.ts:21,24`; `notifications/stream-ticket.ts:13`; `flags/routes/stream.ts:6,21`; `collab/collab-ticket.ts:21`; `collab/richtext-collab-ticket.ts:18`
- Unused signed claim: `workers/src/hmac.ts:27,38`; `getRole` referenced only in `shared/hmac.contract.test.ts`
- Audit findings: `docs/2026-10-10/architecture-audit/05-SCALABILITY-SECURITY-RUNTIME.md` §7–§8
