# noname

Open source AI-native platform. One server replaces CMS, analytics, A/B testing, personalization, and AI content generation. UI is JSON. AI generates it.

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 10 (`npm install -g pnpm`)
- **Docker** (Docker Desktop or Podman) for local services

Use either `docker compose` or `podman compose` — both work with `docker-compose.yml`.

## Quick Start

### One-time setup

```bash
# 1. Clone & install
git clone <repo-url> && cd noname
pnpm install

# 2. Copy environment config
cp .env.example .env
cp packages/server/.env.example packages/server/.env
# Edge: packages/workers/.dev.vars needs WORKER_SERVER_SECRET (same value as root .env)

# 3. Start infrastructure (Postgres, Redis, ClickHouse, ZITADEL, S3, Jaeger)
podman compose up -d   # or: docker compose up -d

# Wait until services are healthy (~30s for ZITADEL on first boot)
podman compose ps

# 4. ZITADEL OIDC app + demo org id in .env + client oidc.json
pnpm init:zitadel

# 5. Push DB schema (fresh DB only — use compose down -v to reset)
pnpm --filter @noname/server db:push

# 6. Seed demo layout (requires API running — do step 7 terminal 1 first, or re-run seed after)
pnpm seed:demo
```

### Dev setup — start order (every day)

Run **infra once** (step 3 above). Then start **three app processes on the host** — edge does **not** run in Docker; use wrangler like client and server.

| Order | Terminal | Command | URL |
|-------|----------|---------|-----|
| 1 | — | `podman compose up -d` (if not already up) | — |
| 2 | API | `pnpm dev` | http://localhost:3000 |
| 3 | Edge | `pnpm --filter @noname/workers dev` | http://localhost:8787 |
| 4 | Client | `pnpm --filter @noname/client dev` | http://localhost:5173 |

Then open the site:

```text
http://{ZITADEL_DEMO_ORG_ID}.localhost:5173
```

(`ZITADEL_DEMO_ORG_ID` is in `.env` after `pnpm init:zitadel` — numeric org id as subdomain until [Phase 3 slug](./docs/2026-07-25/PHASE-3-STORE-SLUG.md).)

Optional commerce extension demo: `pnpm seed:demo:commerce` (after `pnpm seed:demo`).

**Request path:** browser → client `:5173` → proxies `/api` → edge `:8787` → JWT + HMAC → API `:3000`.

**Sign-in:** Sign in on the site → ZITADEL → `/callback` → Bearer token on API calls. See [`docs/2026-07-25/AUTH-IDENTITY.md`](./docs/2026-07-25/AUTH-IDENTITY.md).

**Fresh database:** `podman compose down -v && podman compose up -d` then repeat one-time setup (steps 4–6).

```bash
# All three app processes (copy into separate terminals):
pnpm dev
pnpm --filter @noname/workers dev
pnpm --filter @noname/client dev
```

## Environment

Copy `.env.example` to `.env` at the project root:

| Variable | Default | Service |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://noname:noname_dev@localhost:5432/app` | Postgres |
| `REDIS_URL` | `redis://localhost:6379` | DragonflyDB (Redis-compatible) |
| `CLICKHOUSE_URL` | `http://localhost:8123` | ClickHouse |
| `ZITADEL_ISSUER` | `http://localhost:8080` | ZITADEL auth (OIDC issuer) |
| `WORKER_SERVER_SECRET` | (shared secret) | HMAC trust between edge worker and API server |
| `OPENAI_API_KEY` | (optional) | Real LLM generation |
| `ANTHROPIC_API_KEY` | (optional) | Real LLM generation |

Copy `packages/server/.env.example` to `packages/server/.env` for R2/S3 asset storage config.

## Infrastructure

All services run via Docker Compose:

```bash
podman compose up -d         # start everything (or docker compose up -d)
podman compose ps            # check status
podman compose logs -f       # tail all logs
podman compose down -v       # tear down + delete data
```

| Service | Port | Purpose |
|---------|------|---------|
| **Postgres 16** | 5432 | Primary DB — JSONB content, ACID transactions |
| **DragonflyDB** | 6379 | Redis-compatible — cache + BullMQ queue backend |
| **ClickHouse** | 8123/9000 | Columnar analytics — event ingestion, aggregations |
| **ZITADEL** | 8080 | Self-hosted auth — OIDC, MFA, SSO |
| **S3 emulator** | 9000 | R2-compatible asset storage for local dev |
| **Jaeger** | 16686/4318 | OpenTelemetry tracing UI |

## Packages

```
noname/
├── packages/
│   ├── server/      → API server (Hono + Node.js) — 9 DDD domains
│   ├── browser-sdk/ → Client SDK — analytics, errors, trace, flags, replay
│   ├── client/      → Storefront bundle — React 19 + json-render + Module Federation
│   ├── workers/     → Cloudflare Edge Worker — JWT, KV cache, SEO prerender
│   └── cli/         → Developer CLI (skeleton)
├── docs/            → Architecture decisions, domain plans
├── scripts/         → Database init scripts
└── docker-compose.yml → Local dev infrastructure
```

## API Server (`packages/server`)

```bash
pnpm dev                          # start dev server (tsx watch)
pnpm --filter @noname/server dev  # same, explicit

# Database
pnpm --filter @noname/server db:push     # push schema to DB
pnpm --filter @noname/server db:generate # generate migrations
```

### API Routes

| Route | Domain |
|-------|--------|
| `/api/documents/:type` | Content + layout CRUD |
| `/api/machines/:id/:event` | State machine engine |
| `/api/flags` | Feature flags + evaluation |
| `/api/context` | Visitor context resolution |
| `/api/agents/tasks` | AI agent task manager |
| `/api/ai/generate/*` | AI generation pipeline |
| `/api/analytics/*` | Event tracking + queries |
| `/api/edge/*` | Edge worker bridge |
| `/api/tenants/*` | Tenant catalog manifests + component publishing |

## Edge Worker (`packages/workers`)

**Local dev:** run on the host with wrangler (not in `docker-compose.yml`). Same as client/server — restart when you change worker code.

```bash
pnpm --filter @noname/workers dev    # :8787 — start before or with client (client proxies /api here)
pnpm --filter @noname/workers deploy # deploy to Cloudflare (production)
```

The client rspack dev server proxies `/api` → `http://localhost:8787`. The worker validates JWT, signs HMAC, and proxies to the API at `:3000`. It does **not** have direct DB access.

See `docs/2026-07-11/EDGE_WORKER.md` and `docs/2026-07-25/AUTH-IDENTITY.md`.

## Development

```bash
# From project root:
pnpm lint         # Biome — lint all packages (0 errors)
pnpm format       # Biome — format all files
pnpm check        # Biome — lint + format check
pnpm typecheck    # TypeScript — typecheck all packages
pnpm test         # Vitest — run all tests
pnpm test:watch   # Vitest — watch mode
```

## Architecture

```
Visitor → Cloudflare Edge Worker (JWT, cache, SEO prerender)
              │
              ▼
         API Server (Hono + Node.js)
              │
    ┌─────────┼─────────┬──────────┬──────────┐
    │         │         │          │          │
 documents  machines  context    flags     agent
    │         │         │          │          │
    └─────────┴─────────┴──────────┴──────────┘
              │
         Postgres + ClickHouse + DragonflyDB
```

All 9 domains follow Domain-Driven Design: `ports.ts` → `entity.ts` → `service.ts` → `adapters/postgres.ts` → `api.ts` → `index.ts`.

Auth is handled at the edge (ZITADEL JWT validation + HMAC signing). See `docs/2026-07-13/AUTH.md`.
