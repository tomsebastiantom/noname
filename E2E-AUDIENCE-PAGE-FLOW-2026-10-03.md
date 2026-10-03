# Audience-to-page experience E2E — 2026-10-03

## Result

**Pass for the runtime member/default selection path.** The signed-in demo account rendered the new experience after the trusted activity assigned its Audience membership; after UI sign-out, the same route returned the default layout. The signed-in account also rendered the default before the activity, confirming the transition rather than only comparing two unrelated sessions.

The flow used the already-running local stack; no services were restarted, no Compose volumes were reset, and no checkout/provider callbacks or provider credentials were used.

## Authored configuration

- **Audience:** `admin_e2e_muslhpax` (active; definition version 1).
- **Rule:** `commerce.order.paid` v1, `order.status equals "paid"`, assign membership, 30-day membership expiry. Created, validated, and activated in the Admin Audiences UI.
- **Experience binding:** active version 2; page `/`, all locales; goal `commerce.order.paid`; 24-day attribution window. Binding version 1 was superseded. The selected published layout is `home` / segment `e2e_member_muslhpax`, layout ID `81af1799-8ea1-46d9-9088-099b99a989fd`.
- **Variant:** published with header text `AUDIENCE MEMBER EXPERIENCE 20261003`.

The extra binding version was needed because an existing active smoke binding (`browser_smoke_1790732519554`, version 2) also targeted `/` and initially outranked the new audience's version-1 binding. The new audience's version-2 binding was activated through Admin; the edge response then attributed the request to `admin_e2e_muslhpax` and the new segment.

## Verified transition

1. Before the final activity, the demo account was authenticated but had no active Audience memberships from the test event. The root schema response was HTTP 200, `experience: null`, and the page showed **Welcome to Noname**.
2. The server-side `AudienceService.processActivity()` path processed activity `fad30ee2-f385-423f-b9e9-2a34a0fafd57` for user `390508237348864010`:
   - type/version: `commerce.order.paid` / `1`
   - facts: `{ "order": { "status": "paid" } }`
   - result: not a duplicate; assignment to `admin_e2e_muslhpax` confirmed.
3. The signed-in root page then showed **AUDIENCE MEMBER EXPERIENCE 20261003**. The schema response was HTTP 200 and included audience `admin_e2e_muslhpax`, binding version 2, layout ID `81af1799-8ea1-46d9-9088-099b99a989fd`, segment `e2e_member_muslhpax`, and a decision ID.
4. After signing out in the storefront UI, the root page again showed **Welcome to Noname**; the schema response was HTTP 200 with `experience: null` and `authenticated: false`.
5. Final Browser MCP console check: **0 errors, 0 warnings**.

The activity also matched the pre-existing smoke Audience rule. To avoid leaving that unrelated side effect, its assignment from this exact test event was revoked after verification; event/history records were retained. The final active membership is only the intended `admin_e2e_muslhpax` test membership. The two incomplete attempt Audiences and their layout variants were archived. The successful test Audience, binding, variant, and intended membership remain active for inspection.

## UI and storage limitations found

- **Not a UI-only page-edit flow:** the Admin Layout editor exposes the `default` segment but no editor for nondefault experience segments. The variant was therefore created, edited, and published using the authenticated layout API from the Browser MCP page (`PUT /api/documents/layout/home/variants`, followed by update and publish). Audience rule and binding authoring/activation were performed through the Admin UI. This verifies the full runtime path, but it should not be described as a fully UI-driven Admin-to-page-edit E2E.
- **Historical 30-day binding-window persistence issue (fixed in the follow-up below):** the Admin form defaulted to 30 days (`2,592,000,000` ms), while `audience_experience_bindings.attribution_window_ms` was a PostgreSQL `integer` (`int4`, maximum `2,147,483,647`). The 30-day binding insert failed; using 24 days (`2,073,600,000` ms) succeeded. The follow-up replaced millisecond storage with decimal-day storage; the active v2 fixture remains at 24 days.

## Attribution-days follow-up — 2026-10-03

The persistence issue above is fixed: binding and decision records now store `attribution_window_days` as `numeric(14,12)` and the API uses `attributionWindowDays`. The database does not store milliseconds; runtime code derives milliseconds only for `Date`/timestamp deadline arithmetic. Fractional days are supported and the Admin input is not integer-stepped.

The already-running dev database now has day-valued columns and its existing values were converted without changing their durations (4 bindings and 12 decisions were present). No migration file is retained for this dev-only project; fresh databases use the updated Drizzle schema. A live PostgreSQL round-trip stored and reread both `2.5` and `30` days. The real Postgres attribution query accepted a goal at 2 days and rejected one at 3 days for a 2.5-day window. This also exercised and fixed raw-SQL timestamp parameter encoding.

Browser MCP verification used the existing stack without restarts or volume resets. The Admin displayed a temporary v3 draft as `2.5 days` (it was removed after capture); the existing active v2 remained at 24 days. The signed-in member still received v2 and the signed-out guest still received the default. API, identity, worker, and storefront health checks returned HTTP 200; final Browser MCP console check reported 0 errors and 0 warnings.

Follow-up evidence:

- Fractional draft in Admin: `.playwright-mcp/e2e-attribution-days-admin-fractional-draft.yml`
- Signed-in member/schema: `.playwright-mcp/e2e-attribution-days-member.yml`, `.playwright-mcp/e2e-attribution-days-member-schema.json`
- Signed-out guest/schema: `.playwright-mcp/e2e-attribution-days-guest.yml`, `.playwright-mcp/e2e-attribution-days-guest-schema.json`
- Console check: `.playwright-mcp/e2e-attribution-days-console.log`

## Evidence files

- Admin rule active: `.playwright-mcp/e2e-audience-rule-active.yml`
- Admin binding v2 active and earlier incomplete Audiences archived: `.playwright-mcp/e2e-final-admin-binding-v2-active.yml`
- Authenticated variant create/update/publish result: `.playwright-mcp/e2e-layout-variant-api.json`
- Incomplete-attempt archival responses: `.playwright-mcp/e2e-partial-fixture-cleanup.json`
- Authenticated, pre-event default view/schema: `.playwright-mcp/e2e-final-pre-event-default.yml`, `.playwright-mcp/e2e-final-pre-event-schema.json`
- Post-event member view/schema: `.playwright-mcp/e2e-final-member-view.yml`, `.playwright-mcp/e2e-final-member-schema.json`
- Signed-out default view/schema: `.playwright-mcp/e2e-final-guest-view.yml`, `.playwright-mcp/e2e-final-guest-schema.json`
- Final console check: `.playwright-mcp/e2e-final-console.log`

At the time of the original E2E, temporary helper scripts were removed and no application source files had been changed. The day-storage follow-up above later updated server/client source and added the data migration and operator notes.
