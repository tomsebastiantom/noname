# Test Fixture Architecture Analysis

Date: 2026-09-14

## Executive decision

The notification test should not import an email specification from the seed profile:

```ts
import { agentTaskCompleteEmailSpec } from
  "../../../../../packages/seeding/src/profiles/platform/email-specs";
```

That creates the wrong dependency direction:

```text
server domain test → seeding profile → platform seed orchestration
```

`packages/seeding` owns environment population and demo-profile orchestration. It must not become the repository's test-fixture library.

The recommended architecture is:

```text
packages/fixtures
  pure, deterministic, side-effect-free fixture values and builders

packages/seeding
  CLI, profiles, API adapters, trusted internal seed ports
  imports packages/fixtures when a demo seed needs the same data

server/domain tests
  import packages/fixtures for shared cross-domain values
  keep domain-only mocks/builders beside the domain tests
```

The target dependency direction is:

```text
packages/fixtures ← packages/seeding
packages/fixtures ← server tests
packages/fixtures ← vertical tests
```

Never:

```text
server tests → packages/seeding
packages/fixtures → server runtime
```

## What is wrong with the current import?

`agentTaskCompleteEmailSpec` is currently located in:

```text
packages/seeding/src/profiles/platform/email-specs.ts
```

That file is used for two different purposes:

1. The platform demo seed needs a JSON-render email specification to populate CMS content.
2. Notification unit tests need a valid specification to test parsing and rendering.

The value is reusable, but its current location is not. The platform profile is an executable application-population concern. A server unit test should not load that profile or depend on the package that owns its CLI and external API/database wiring.

The current import also makes tests fragile because a platform seed refactor can break notification tests even when notification behavior has not changed.

## Recommended package boundary

Add a private workspace package:

```text
packages/fixtures/
  package.json
  tsconfig.json
  src/
    notifications/
      email-specs.ts
    commerce/
      order.ts
      payment.ts
    documents/
      layouts.ts
    builders/
      deterministic-id.ts
```

Suggested package name:

```text
@noname/fixtures
```

The package should contain only:

- Plain data
- Pure builders
- Deterministic defaults
- Narrow fixture types
- Optional factory functions with explicit overrides

It should not contain:

- `fetch`
- database clients
- Drizzle services
- Hono routes
- authentication
- environment loading
- `process.env` reads
- Vitest imports
- global mutable state
- seed runner logic

Example:

```ts
// packages/fixtures/src/notifications/email-specs.ts
export const agentTaskCompleteEmailSpec = {
  root: "html",
  elements: {
    // pure JSON-render fixture data
  },
} as const;
```

Then both consumers become independent:

```ts
// server test
import { agentTaskCompleteEmailSpec } from "@noname/fixtures/notifications/email-specs";
```

```ts
// platform seed profile
import { agentTaskCompleteEmailSpec } from "@noname/fixtures/notifications/email-specs";
```

The platform seed remains responsible for deciding where and when to publish the value:

```text
fixture value → authenticated CMS API → published notification_email entry
```

The fixture package only supplies the value.

## Three categories of test data

These should not be collapsed into one package.

### 1. Pure shared fixtures

Examples:

- JSON-render email specs
- valid content-type documents
- canonical provider event payloads
- stable Evidence record shapes
- deterministic order/payment objects

Location:

```text
packages/fixtures
```

These can be consumed by both tests and deterministic demo seeding.

### 2. Domain-local test doubles

Examples:

- `NotificationsStorage` mocks
- queue fakes
- repository stubs
- auth adapter fakes
- domain-specific invalid inputs

Location:

```text
packages/server/src/domains/notifications/__fixtures__/
packages/server/src/domains/notifications/test-doubles.ts
```

These should remain close to the domain because they encode the domain's test contract, not shared application data.

### 3. Environment seed workflows

Examples:

- logging into ZITADEL
- creating users
- calling authenticated APIs
- publishing layouts
- writing Evidence through a trusted internal port
- ordering platform before Commerce

Location:

```text
packages/seeding/src/profiles
```

These are not test fixtures. They are executable environment population workflows.

## Why not put fixtures inside `packages/seeding`?

That would make `packages/seeding` both:

```text
seed execution framework + shared test-data library
```

It would also encourage tests to import profile internals. Over time, this creates several problems:

- Test packages depend on a CLI-oriented package.
- Seed profile imports can transitively load server, client, vertical, or environment code.
- Unit tests become coupled to demo organization and store configuration.
- Fixture reuse becomes hard to discover because values are buried under profiles.
- A seed profile cannot be safely deleted or reorganized without breaking unrelated tests.
- The dependency graph becomes harder to keep acyclic.

The specific current import is therefore a design smell, even though the imported value itself is valid.

## Factory versus fixture guidance

Use a constant fixture when the exact shape is part of the contract:

```ts
export const agentTaskCompleteEmailSpec = { ... } as const;
```

Use a builder when tests need controlled variation:

```ts
export function buildNotificationEmailEntry(
  overrides: Partial<NotificationEmailEntry> = {},
) {
  return {
    templateKey: "agent-task-complete",
    subject: "Task complete",
    category: "operational",
    spec: agentTaskCompleteEmailSpec,
    ...overrides,
  };
}
```

Use a factory when IDs, timestamps, or relationships must be generated:

```ts
export function buildOrderFixture(overrides = {}) {
  const orderId = overrides.orderId ?? "fixture-order-1";
  return {
    id: orderId,
    // deterministic defaults
    ...overrides,
  };
}
```

Builders must remain deterministic by default. Randomness should be explicit and injectable, never hidden inside a shared fixture module.

## Test isolation policy

Shared fixtures should be immutable values or fresh objects returned by builders.

Do not export mutable singleton objects that tests can modify. Prefer:

```ts
export function buildEmailSpec() {
  return structuredClone(agentTaskCompleteEmailSpec);
}
```

or return a newly constructed object. If a constant is exported, tests must treat it as readonly.

Environment setup belongs in Vitest setup files or test harness utilities, not in fixture modules:

```text
packages/test-support
  database reset helpers
  request clients
  auth test sessions
  queue fakes
  test lifecycle hooks
```

A future `packages/test-support` package may be useful, but it should not be introduced merely to move one mock. First create `packages/fixtures`; add `test-support` when multiple packages need lifecycle or infrastructure helpers.

## Recommended dependency graph

```text
@noname/auth
@noname/documents
@noname/shared
       ↑
@noname/fixtures
       ↑                 ↑
@noname/seeding       server tests
       ↑                 ↑
root seed CLI       domain test suites
```

The fixtures package should depend only on the smallest type/data packages required. It should not depend on `@noname/server`, `@noname/client`, or `@noname/seeding`.

`@noname/seeding` may depend on `@noname/fixtures`, server adapters, vertical modules, and application clients because it is the composition boundary.

## Open-source and ecosystem patterns reviewed

### Vitest

Vitest separates test context and fixture lifecycle from the values used by tests. Its test-context documentation demonstrates extending test behavior without making every test own global setup. This supports keeping pure data fixtures separate from lifecycle helpers:

- [Vitest test context](https://v1.vitest.dev/guide/test-context)
- [Vitest fixture system overview](https://deepwiki.com/vitest-dev/vitest/3.4-fixture-system)

### Playwright

Playwright's fixture model distinguishes test-scoped and worker-scoped resources. The important lesson is that fixture lifetime and fixture data are separate concerns. A database or browser lifecycle fixture should not be confused with a static order or email payload:

- [Playwright fixtures documentation](https://playwright.dev/docs/test-fixtures)

### Factory Bot

Factory Bot uses factories to produce fresh test objects with overridable attributes rather than encouraging tests to mutate shared records. This maps well to pure builders in `@noname/fixtures` and domain-local persistence setup in test support:

- [Factory Bot README](https://github.com/thoughtbot/factory_bot)

### Django

Django distinguishes serialized initial data fixtures from test setup and supports loading fixtures for tests. The relevant pattern is that data definitions are separate from the mechanism that loads them into an environment:

- [Django initial data fixtures](https://django.readthedocs.io/en/6.1.x/howto/initial-data.html)
- [Django database fixtures](https://django.readthedocs.io/en/stable/topics/db/fixtures.html)

### Monorepo fixture isolation

A recent monorepo testing discussion emphasizes avoiding shared mutable state and separating worker-scoped setup from test-scoped data. This reinforces the proposed split between pure fixtures and `test-support` lifecycle utilities:

- [Monorepo testing shared fixture strategy](https://qaskills.sh/blog/monorepo-testing-shared-fixture-strategy)

### Medusa

Medusa recommends custom CLI seed scripts that resolve application services and workflows rather than exposing seed writes as public endpoints. This supports keeping executable seeding in `packages/seeding` while moving reusable data values into a neutral fixtures package:

- [Medusa custom CLI seed scripts](https://docs.medusajs.com/learn/fundamentals/custom-cli-scripts/seed-data)

## Migration plan

### Phase 1: create the neutral fixture package

Create:

```text
packages/fixtures/
  package.json
  tsconfig.json
  src/notifications/email-specs.ts
```

Move:

```text
packages/seeding/src/profiles/platform/email-specs.ts
```

to the fixtures package. Preserve the exported values and make them readonly.

### Phase 2: update consumers

Update:

```text
packages/server/src/domains/notifications/email-template.test.ts
packages/server/src/domains/notifications/service.test.ts
packages/seeding/src/profiles/platform/index.ts
```

to import from `@noname/fixtures`.

### Phase 3: classify future data

For every value added later, decide:

```text
pure shared data       → packages/fixtures
single-domain mock     → domain __fixtures__ or test-doubles.ts
environment workflow   → packages/seeding profile
lifecycle/infrastructure → packages/test-support, when justified
```

### Phase 4: prevent regression

Add a review rule:

```text
Tests must not import packages/seeding profiles.
Seeding profiles may import packages/fixtures.
```

A lint rule or dependency-cruiser rule can enforce this later. A simple grep-based CI check is sufficient initially.

## Final recommendation

Move the email specification out of `packages/seeding`. Do not move it directly into the notification test file because the platform seed legitimately needs the same canonical specification.

Create `@noname/fixtures` as a neutral, pure-data package. Keep domain-specific mocks near their domain tests. Keep API/database/auth workflows in `@noname/seeding`.

This gives the repository three clean layers:

```text
fixtures       what the data is
seeding        how an environment is populated
test-support   how tests obtain isolated infrastructure
```
