# Tenant MF Catalog — Security Model

> **Date:** 2026-07-25  
> **Status:** Design + gaps — read before Git integration or opening publish to merchants  
> **Related:** [`TENANT-MF-GIT.md`](./TENANT-MF-GIT.md) · [`TENANT-MF-CDN.md`](./TENANT-MF-CDN.md) · [`SECURITY-HANDOFF.md`](./SECURITY-HANDOFF.md)

---

## Trust model (important)

Tenant catalog code is **JavaScript that runs in the visitor’s browser** on the same page as the platform host app (Module Federation remote). It is **not** sandboxed in an iframe or separate origin today.

| Who | Trust level |
|-----|-------------|
| **Platform** (core + extensions) | Fully trusted — you ship it |
| **Tenant** (store owner) | **Trusted by default** for their own storefront — like Shopify theme code |
| **Visitor** | Untrusted — never publishes code |
| **Marketplace author** (future) | Limited trust — needs stricter sandbox / review |

**Implication:** A malicious or compromised **merchant account** (or stolen admin JWT) can ship JS that runs in customers’ browsers: read cookies visible to that origin, call your public APIs as the user, manipulate DOM, exfiltrate data typed on the page, etc.

This is the same class of risk as **custom themes, App Store apps, and Retool custom components** — not arbitrary server-side RCE (build runs on your server in a temp dir, but Rspack is not a strong isolation boundary).

---

## What tenant code can and cannot do today

### Can (browser, same session as storefront)

- Render arbitrary React UI in layout slots
- `fetch()` to URLs the browser allows (CORS permitting)
- Read `localStorage` / cookies for **your storefront origin**
- Access anything the host page can access (MF shares React scope with host)
- Run `useEffect` loops, crypto miners, keyloggers on your pages — **if published**

### Cannot (today, mostly by convention — not enforced)

- ~~Not enforced~~ Arbitrary npm imports (bundler *should* allowlist; not fully locked down yet)
- Direct Postgres / server secrets (no server env in client bundle)
- Bypass org scoping on **authenticated admin APIs** without a valid JWT (visitor has no admin token)
- Modify another tenant’s R2 prefix (upload is server-side keyed by `orgId`)

### Build-time (server)

- Rspack runs in OS temp directory — **not** a container sandbox
- Malicious source could attempt resource exhaustion (large bundle, slow compile) → need queue limits + timeouts
- Do not run untrusted code with `eval` on raw user input outside Rspack (we don’t today)

---

## Defense layers (recommended)

### 1. Who can publish (authz) — **required**

| Control | Purpose |
|---------|---------|
| JWT + org scope on `POST /components`, Git webhook | Only tenant admins publish |
| `requireTeamAdmin` or dedicated `catalog:publish` role | Not every editor |
| MFA when `requireMfaForAdmin` | Stolen password ≠ instant malicious deploy |
| Audit log: who published commit SHA / version | Forensics + rollback |

**Today:** Admin routes require auth; paste endpoint exists — treat as **dev-only** until authz is tightened on publish.

### 2. Build-time validation — **required before prod**

Before Rspack:

| Check | Blocks |
|-------|--------|
| Parse TSX (swc/typescript) | Syntax errors |
| Required exports present | Broken registry |
| **Import allowlist** | `fs`, `child_process`, random npm packages |
| Deny `eval`, `Function`, dynamic `import()` of URLs | Obvious dynamic code loading |
| Max source size / file count (Git clone) | DoS |
| Build timeout + memory cap in worker | DoS |

Documented allowlist (initial):

```
react, react-dom, zod, @json-render/core, @json-render/react
```

Optional later: `@noname/extensions/*` for approved extension APIs only.

### 3. json-render boundary — **component surface**

Layouts only reference **registered component types** with **props from JSON spec**. Tenant code should:

- Implement components + optional **actions** registered in catalog
- Not receive raw HTML injection via props unless you explicitly allow `dangerouslySetInnerHTML`

Platform controls which **action handlers** exist (`executeAction` merge). Prefer **server-side validation** for anything that mutates data (cart, checkout) — actions call **your APIs**, not tenant-defined backend URLs without review.

### 4. Runtime (browser) — **partial**

| Control | Status |
|---------|--------|
| MF shared scope `default` | Host supplies React / json-render — good |
| Content Security Policy | Not tenant-specific yet — consider `script-src` nonces for host; remotes load from CDN allowlist |
| Subresource Integrity | Hard with MF + hashed chunks; rely on manifest + CDN origin trust |
| iframe sandbox | **Not used** — would break MF integration; marketplace untrusted code may need iframe later |

### 5. CDN / manifest integrity

| Control | Purpose |
|---------|---------|
| Manifest only updatable server-side after build | Visitors load what you published |
| `?v=` on remoteEntry + immutable chunks | Reduce cache confusion |
| Optional: sign manifest or bundle hash in Postgres | Detect tampering if R2 compromised |
| Git: build only from connected repo + verified webhook signature | Prevents forged deploy triggers |

### 6. Git-specific

| Control | Purpose |
|---------|---------|
| GitHub App minimal permissions (read + hooks) | No write to merchant repo |
| Pin deploy to installation + repo id | Webhook cannot deploy to wrong org |
| Optional: required status checks / manual approve for production | PR review before live |

---

## Threat scenarios

| Threat | Mitigation |
|--------|------------|
| Stolen merchant admin session | MFA, short JWT TTL, publish audit + alert |
| Malicious employee publishes JS | Role `catalog:publish`, audit log, rollback manifest |
| Compromised GitHub repo | Webhook secret; optional manual “Promote to live” |
| Supply-chain npm in tenant repo | **Import allowlist** at validate; no `package.json` install in v1 |
| XSS via layout props | json-render prop schemas (zod); sanitize strings in platform components |
| Tenant fetch exfiltrates PII | CSP `connect-src`; document that merchants are responsible for their components; monitor anomalous domains (future) |
| Build DoS | Queue concurrency, timeout, max bundle size |
| Cross-tenant bundle mix-up | R2 key `tenants/{orgId}/`; manifest resolved via org from slug |

---

## Marketplace (future) — stricter than private tenant

Private tenant = **their store, their code, their risk** (you trust the merchant contractually).

Marketplace extensions = **third party** → need:

- Code review or automated scan before listing
- Separate MF share scope (already designed as `marketplace`)
- Stronger import allowlist + no raw network without declared domains
- Optional iframe/isolated renderer for untrusted UI

---

## Current gaps (honest)

| Gap | Priority |
|-----|----------|
| Import allowlist not enforced in bundler | P0 before merchant self-serve |
| No validate step before Rspack | P0 |
| Publish API not restricted to dedicated role | P0 |
| Build not in container / resource limits | P1 |
| No publish audit log | P1 |
| No CSP tuned for tenant CDN origins | P2 |
| No automated malicious-pattern scan | P2 |

---

## Merchant-facing policy (product)

Tell merchants clearly:

- Custom catalog code runs on **your storefront** in customers’ browsers
- They must not collect card data outside your approved checkout flows
- They are responsible for code in **their** connected repo (same as theme liability)
- Platform can disable catalog or rollback on abuse

---

## Implementation checklist (with Git pipeline)

1. **Authz** on all publish/deploy routes  
2. **Validate** adapter with import allowlist + size limits  
3. **Bundler** `externals` / resolve restrictions matching allowlist  
4. **Worker** timeouts + BullMQ concurrency  
5. **Audit** `tenant_settings.catalogPublishLog[]`  
6. **Docs** in admin UI: “Custom code runs in customer browsers”  
7. **Rollback** API: repoint manifest to previous version  

---

## References

- Git source flow: [`TENANT-MF-GIT.md`](./TENANT-MF-GIT.md)
- CDN delivery: [`TENANT-MF-CDN.md`](./TENANT-MF-CDN.md)
- Admin auth / MFA: [`SECURITY-HANDOFF.md`](./SECURITY-HANDOFF.md)
