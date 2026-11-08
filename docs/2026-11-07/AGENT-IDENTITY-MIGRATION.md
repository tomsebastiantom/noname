# Agent identity migration — `nag.` → ZITADEL OAuth

> **Status:** design · **Date:** 2026-11-07 (America/Toronto)
> **Scope:** replace the custom agent token with a standards-based OAuth path, without changing the authorization
> model. No code in this document is implemented yet.
> **Verified against current code** (see §2), not against the earlier notes.
> **Related:** [`PLATFORM-OPERATOR-DESIGN.md`](./PLATFORM-OPERATOR-DESIGN.md) (machine identity) ·
> [`EVAL-IDENTITY-RETIREMENT.md`](./EVAL-IDENTITY-RETIREMENT.md) (`nsv.` retirement) · [`PENDING-DECISIONS.md`](./PENDING-DECISIONS.md)

---

## 1. What we are solving

Agents today use `nag.`, a custom HMAC token. It works, but it is a second authenticator with a shared minting
secret. The goal is **one standards-based agent identity**, while keeping the same `PERMISSIONS` catalog and the
same guards.

There are two agent modes, and they must not be conflated:

| Mode | Meaning | Token today | Token target |
|---|---|---|---|
| **Delegated** | agent acts for its owner | `nag.` with `onBehalfOf = ownerUserId` | OAuth token exchange: `subject = user`, `actor = agent`, `act` claim |
| **Autonomous** | agent acts for itself | **does not exist** | client credentials / private-key JWT, no `act` |

**Important:** autonomous agents are **new product capability**, not part of this migration. They would be machine
identities (ZITADEL service accounts), never fake users.

## 2. Current state (verified in code)

| Fact | File |
|---|---|
| Agent token is HMAC-SHA256 over base64url JSON, prefix `nag.` | `packages/server/src/shared/agent-token.ts` |
| Claims: `agentId`, `agentSlug`, `orgId`, **`onBehalfOf`**, `permissions`, `exp` | same, lines 5–12 |
| Verification **requires** `onBehalfOf` to be a string | same, line 43 |
| Token mints only from an owned agent + acting user token | `domains/agent/registry-service.ts:131-157` |
| `onBehalfOf` is always `agent.ownerUserId` | same, line 152 |
| Permissions are `ownerPermissions ∩ requested` | same, line 142 |
| TTL is 1 hour | `registry-service.ts:13` |
| Agent table requires `owner_user_id` | `domains/agent/schema.ts:45` |
| Guard maps a valid `nag.` token to `AgentActor` and enforces org match | `domains/auth/guards.ts:69-84` |
| `AgentActor.onBehalfOf` is a required string | `packages/auth/src/actors.ts` |

**Conclusion:** there is no self-acting mode. Every agent action is attributable to an owner.

## 2a. Provisioning status and the current blocker (2026-11-07)

Provisioned on the local ZITADEL (not production):

| Piece | Result |
|---|---|
| Confidential OIDC app | created with `OIDC_GRANT_TYPE_TOKEN_EXCHANGE` + basic auth; client id/secret kept out of git |
| Agent machine user | `agent-runner` created in the demo org |
| Agent service-account key | created (JSON key) and stored in `zitadel_keys/agent-runner-sa.json` (gitignored) |
| Project role `agent_runner` | created and granted to the machine user |
| Private-key JWT | **live success**: service-account token issued (`expires_in ≈ 12h`) |
| Token exchange request | reaches ZITADEL with client auth + actor/subject tokens |

**Impersonation policy enabled.** The v1 security policy field is `enableImpersonation`:
`PUT /admin/v1/policies/security {"enableImpersonation":true}` → 200. The previous attempts used the wrong field
names (`impersonation`, `impersonationAllowed`, `allowImpersonation`) and consequently reported “No changes”.

**Live exchange now succeeds** (with the actor service account, client auth, and `requested_token_type = jwt`):

```
sub = 397185959570964491        (the user)
act = { iss: http://localhost:8080, sub: 398638652919382029 }   (the agent)
aud = [ 397185680666525707 ]    (project)
```

So the private-key JWT, client authentication, impersonation permission and RFC 8693 exchange are all working.

**User token acquisition (resolved).** The login UI path is broken on this instance
(`/ui/v2/login/login` → JSON 404), so the user token was obtained through the supported **Session API** flow:

1. `POST /oauth/v2/authorize` (PKCE) → `authRequest` id;
2. `POST /v2/sessions` with the demo editor login/password → `sessionId` + `sessionToken`;
3. `POST /v2/oidc/auth_requests/{id}` with the session and the `IAM_LOGIN_CLIENT` PAT → callback code;
4. `POST /oauth/v2/token` with the code + PKCE verifier → user access token.

The SPA application also needed **role assertion** enabled (`accessTokenRoleAssertion`,
`idTokenRoleAssertion`) — without it the user token carried no project roles at all.

**The exchanged JWT itself still has no role claim**, but the OIDC **userinfo** endpoint for that same token does:

```
userinfo roles: {"editor":{"396614483469991947":"zitadel.localhost"}}
```

The verifier therefore falls back to userinfo when the JWT carries no roles, and the full delegated verification
now succeeds live:

```
{
  agentUserId: "398638652919382029",   (agent machine user = act.sub)
  onBehalfOf: "397185959570964491",    (editor user = sub)
  orgId: "396614483469991947",
  permissions: ["storefront:view","content:draft_write","layout:draft_write","page:draft_write"],
  exp: 1794147896
}
```

That is the complete identity chain: private-key JWT → actor token → token exchange → JWKS-verified delegated JWT
→ roles from userinfo → the existing permission catalogue.

**Next action:** wire this verifier into the guard, add `zitadel_agent_user_id`, replace minting, delete `nag.` in
the same cutover.

**Live agent-task E2E (2026-11-07).** With the API restarted and the agent exchange env configured:

| Step | Result |
|---|---|
| editor OIDC token (Session API + PKCE) | issued |
| `POST /api/agents/registry` as editor | **201**, `ownerUserId = editor` |
| `POST /api/agents/registry/:id/token` | **200**, delegated JWT `.sub = editor`, `.act.sub = agent machine user` |
| `GET /api/documents/layout` with the delegated JWT | **200** — agent authenticated and authorized through the `PERMISSIONS` catalogue |
| old `nag.` token on the same route | **401** — the legacy path is gone |

**Per-agent identity implemented (2026-11-07).** `registered_agents.zitadel_agent_user_id` stores the mapping;
on the first token request the registry provisions a **dedicated ZITADEL machine user** per agent (key under
`zitadel_keys/agents/<agentId>.json`, `IAM_ADMIN_IMPERSONATOR`), then exchanges the user token with **that**
service account as actor. The shared `agent-runner` is no longer used by minting.

Live re-run:

```
register 201 → id 46d42f64… (owner editor)
mint     200 → delegated JWT
         sub = 397185959570964491 (editor)
         act = { sub: 398642247689568269 }   ← per-agent machine user, not the shared runner
GET /api/documents/layout → 200
old nag token → 401
```

Database: `e2e-agent-1794105295471 → zitadel_agent_user_id 398642247689568269`; key file created for that agent.

**Mutating action.** The delegated token also created a layout (`POST /api/documents/layout` → **201**), so the agent
path is not read-only.

**Audit attribution — verified, parity not measurable.** The layout create wrote a row to `document_ops`:

```
actor_type = agent
actor_id   = 398642314748100621   (per-agent ZITADEL machine user)
on_behalf_of = 397185959570964491 (editor)
operation  = create
```

`document_ops` currently has **1 agent row** (the new path) and **109 human rows** — there are **no historical `nag.`
agent rows** to compare against, so old/new parity cannot be measured. The new attribution shape is correct: the
machine identity is the actor and the user is `on_behalf_of`.

The earlier “no audit row” observation was checked against `evidence_audit_events`; document mutations record in
`document_ops` instead.



## 3. Why migrate (triggers)

Not “custom tokens are always bad”. Migrate when one of these becomes true:

1. **Third-party agents** need their own credential (we cannot mint for them).
2. **Cross-org / enterprise SSO** requires the customer IdP to be authoritative.
3. **Per-token revocation or audience** is required (no `aud`, no `jti` today).
4. **Owner permission changes** must be evaluated at token time, not frozen at mint.
5. **One credential model** for platform, eval and agents is required for compliance.

If none applies, `nag.` remains acceptable; but two custom authenticators plus a third (service accounts) is the
real architectural problem.

## 4. Target architecture

ZITADEL is the OAuth authorization server. OAuth is the protocol.

### 4.1 Delegated agent (keeps today’s semantics)

```
1. user logs in (OIDC)                    → user access token
2. agent service account authenticates    → actor token (client credentials / private-key JWT)
3. POST /oauth/v2/token
   grant_type=urn:ietf:params:oauth:grant-type:token-exchange
   subject_token=<user token>&subject_token_type=access_token
   actor_token=<agent token>&actor_token_type=access_token
   scope=<downscoped>
4. token for the user, with act = agent
5. API verifies JWT via JWKS, checks org/aud, reads act.sub = agentId, onBehalfOf = user
```

ZITADEL supports Token Exchange and treats impersonation/delegation through the `actor_token`
([grant types](https://zitadel.com/docs/apis/openidoauth/grant-types),
[token exchange](https://docs-zitadel.vercel.app/docs/guides/integrate/token-exchange#actor-token)).

Constraints from ZITADEL:

- only **confidential clients** should be allowed to perform token exchange;
- the actor must hold an **impersonation permission** (`*_IMPERSONATOR`); impersonating users with administrative
  memberships needs `ORG_ADMIN_IMPERSONATOR`/`IAM_ADMIN_IMPERSONATOR`;
- scope and audience are **downscope-only** — the exchange cannot escalate;
- the exchanged token is short-lived and revocable.

### 4.2 Autonomous agent (future, separate decision)

Client credentials or private-key JWT on a service account; no `subject_token`, no `act`. Permissions come from the
agent’s own role, not the owner’s. This is a new capability and needs its own product decision.

### 4.3 One authorization model

Both modes resolve to the same `PERMISSIONS` keys and the same guards. Only authentication changes:

| Actor | Authenticator | Authorization |
|---|---|---|
| human | ZITADEL OIDC | `PERMISSIONS` from roles |
| delegated agent | OAuth token exchange (`act`) | `PERMISSIONS` from the exchanged token |
| autonomous agent | client credentials / private key JWT | `PERMISSIONS` from its service-account role |
| platform operator | service account + private-key JWT | `PERMISSIONS` from platform role |
| eval worker | service account (until `nsv.` is removed) | read-only eval permissions |

## 5. Identity mapping

| Today | Target |
|---|---|
| `registered_agents.id` | unchanged (domain ID) |
| `registered_agents.slug` | unchanged |
| `registered_agents.ownerUserId` | unchanged (the delegated subject) |
| — | new `zitadel_agent_user_id` (service account / machine user per agent) |
| `nag.` token | deleted after cutover |
| `onBehalfOf` claim | `act` claim in the exchanged token |

**One service account per agent** is the clean mapping: the `act.sub` then identifies the agent, not a shared
runner. A shared runner would blur attribution; if used, the agent ID must still be carried and audited.

## 6. Code changes (when implemented)

| Area | Change |
|---|---|
| `domains/agent/schema.ts` | add `zitadel_agent_user_id` (nullable during migration) |
| `domains/agent/registry-service.ts` | replace `mintToken` with “obtain exchanged token” (no local mint) |
| `shared/agent-token.ts` | remove after cutover; during migration keep verify behind a flag |
| `domains/auth/guards.ts` | verify ZITADEL JWT (JWKS), extract `act`, enforce org/aud, build `AgentActor` |
| `packages/auth/actors.ts` | `AgentActor.onBehalfOf` stays required for delegated; autonomous mode adds an explicit variant |
| config | **no `AGENT_AUTH_MODE` flag**: the verifier is replaced in one release; ZITADEL client id/private key in secret manager |
| audit | `actorType=agent`, `actorId=agentId`, `onBehalfOf=userId`, `act` recorded |
| scripts | delete `mint-service-token.ts` is eval; delete agent mint helpers when cut over |

## 7. Cutover (no fallback)

### Phase 0 — prepare (staging only)

- Enable token exchange on a **confidential** ZITADEL application.
- Create a service account and narrow impersonation role **per agent**; keys in a secret manager.
- Implement the JWT verifier and the token-acquisition path; test both in staging.

### Phase 1 — pre-production verification (no runtime fallback)

- Run the new path against staging with the same agent tasks and compare actor, org, `act`, permissions and audit
  rows with the `nag.` baseline.
- Recorded/real tokens may be replayed in tests; production never accepts two token types.
- Exit criterion: every exercised agent route has a passing new-token test and audit parity is confirmed.

### Phase 2 — single production cutover

One release does all of the following:

- the guard accepts **only** JWTs (JWKS, `aud`, org, `act`);
- agent token acquisition uses token exchange;
- `nag.` verifier, mint helper, `AGENT_TOKEN_SECRET` and their tests are deleted;
- `registered_agents.zitadel_agent_user_id` is required for token issuance.

There is no dual-accept window and no feature flag. Agents obtain a token before the deploy; any `nag.` token
presented after it is rejected.

### Phase 3 — post-cutover verification

- Confirm `agent_auth_new_total` traffic and audit rows.
- Recovery is **roll forward** (fix and redeploy) or pausing agent execution; rolling back to `nag.` is not an
  option because the code no longer exists.

## 8. How to test that the migration is safe (and that old behavior still works)

| Test | What it proves |
|---|---|
| **Verifier unit** | valid/invalid signature, expiry, wrong org, wrong audience, missing `act`, unknown permissions |
| **Exchange integration** | user token + agent actor token → token with `sub=user`, `act=agent`, reduced scopes; cannot exceed subject |
| **Permission intersection** | agent requesting more than the user → denied/reduced; same result as `nag.` |
| **Staging shadow** | old and new paths produce the same actor/org/`act`/permissions for the same tasks — in staging, never in production |
| **Negative** | revoked agent key, expired token, replay, agent from another org, autonomous token on a delegated route |
| **E2E baseline (staging)** | one real agent task with `nag.` recorded as the comparison baseline |
| **E2E new** | same task with the exchanged token; compare output and audit rows |
| **Audit parity** | `actorType`, `actorId`, `onBehalfOf` identical across old/new for the same action |

Cutover criteria:

- staging parity = 0 unexplained mismatches;
- all exercised agent routes have a new-token test;
- audit rows show the agent, not the owner, as actor;
- no production feature flag or dual verifier exists in the release.

## 9. No rollback path (deliberate)

- There is no `AGENT_AUTH_MODE`, no dual verifier, and no retained `nag.` code.
- Recovery is **roll forward**: fix the defect and redeploy; if agents must be stopped, pause the agent queue.
- Reverting to the previous image would reintroduce `nag.`, which is explicitly not allowed.
- Consequence: if ZITADEL is unavailable, delegated agents cannot obtain new tokens and must wait; existing
  short-lived tokens expire. That availability trade-off is accepted in exchange for one production path.

## 10. Risks and open questions

| Risk / question | Note |
|---|---|
| No runtime fallback | ZITADEL outage blocks new agent tokens; accepted to avoid two production auth paths |
| Cutover gap | agents must obtain a token before the release; no `nag.` compatibility window |
| Impersonation role is powerful | narrow role, one service account per agent, secret manager, audit |
| One service account per agent | N accounts/keys; alternative shared runner weakens attribution |
| User token availability | long-running agents need refresh-token handling or pre-granted delegation |
| ZITADEL version support | token exchange must be enabled and tested on our deployment; docs say supported |
| Exchange latency | one extra IdP call when obtaining a token, not per API call |
| Autonomous mode | separate product decision; do not smuggle it in by making `onBehalfOf` nullable |
| Audit continuity | old and new rows must use the same `actorType=agent` shape |

## 11. Order

Do **not** start this before the machine path is standard:

1. request-id + `AUDIT_READ` (attribution);
2. `release-operator` + `eval-runner` service accounts;
3. operator guard + dry-run;
4. eval moves off `nsv.` (and off the demo admin header);
5. **then** this agent migration.

## 12. Acceptance criteria

- a delegated agent obtains a ZITADEL-issued token; API verifies it via JWKS with `act`;
- permissions equal the owner-intersected set (no escalation);
- audit shows agent actor + `onBehalfOf`;
- `nag.` is deleted in the same release, with no dual path and no fallback flag;
- no production toggle or second verifier exists;
- no demo user identity is used anywhere.
