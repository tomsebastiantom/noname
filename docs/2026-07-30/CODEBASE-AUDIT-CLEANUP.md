# Codebase Audit — Open Issues

> **Updated:** 2026-07-31  
> **Fixed items:** [`docs/archive/2026-07-30/CODEBASE-AUDIT-FIXED.md`](../archive/2026-07-30/CODEBASE-AUDIT-FIXED.md)  
> **Error handling rule:** [`ERROR-HANDLING.md`](../2026-07-31/ERROR-HANDLING.md)  
> **Shared packages rule:** [`SHARED-PACKAGES.md`](../2026-07-31/SHARED-PACKAGES.md)

Severity: 🔴 high · 🟡 medium · 🟢 low

---

## Still open

| P | Severity | Issue | Notes |
|---|---|---|---|
| — | 🟡 | `useAsyncForm()` for 9 admin components | Deferred; large UI refactor |
| — | 🟡 | MF shared-dep versions hardcoded in `mf-init.ts` | Build-time inject from `package.json` |
| — | 🟡 | Stale doc banners (`AUTH.md`, permissions partial supersessions) | Extend `ARCHITECTURE-MAP.md` deprecated table |
| — | 🟢 | Store-slug parsing duplicated client vs worker | Shared pure util |
| — | 🟢 | God-components (`ContentEntryAdmin`, `LoginForm`) | Split by view |
| — | 🟢 | `browser-sdk` positional factory args | Options objects |
| — | 🟢 | Cart read-modify-write (2 round-trips) | Incremental machine API |
| — | 🟢 | `event-bus` typed event map | Replace `unknown`/`any` subscribers |
| — | 🟢 | `auth/api.ts` repeated parse/catch per route | Migrate with P6 opportunistically |
| — | 🟡 | Broader test coverage (5 domains + client + browser-sdk) | CI added; domain tests ongoing |

---

## Recently fixed (2026-07-31)

See archive for full list. Highlights: P6 pagination helper, P9 error-handling doc, P10 product docs → `docs/product/`, P12 Redis event-bus + SSE, P13 Redis manifest store, P14 CI workflow + bundler tests, P15 build timeout + source validation, P16 permission checks, P17 userinfo timeout, ClickHouse prod creds guard, documents-domain dedupe (`shared/locale`, `assets/url`, `document-guards`, `routing-page`, client `documentIdFromFieldValue`).
