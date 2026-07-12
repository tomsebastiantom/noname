# noname

Open source AI-native platform. One server replaces CMS, analytics, A/B testing, personalization, and AI content generation. UI is JSON. AI generates it.

## Prerequisites

- **Node.js** >= 20
- **pnpm** >= 10 (`npm install -g pnpm`)
- **Docker** (Docker Desktop or Podman) for local services

## Quick Start

```bash
# 1. Clone & install
git clone <repo-url> && cd noname
pnpm install

# 2. Copy environment config
cp .env.example .env
cp packages/server/.env.example packages/server/.env

# 3. Start infrastructure (Postgres, Redis, ClickHouse, Logto, S3, Jaeger)
docker compose up -d

# 4. Wait for healthy services, then run DB migrations
pnpm --filter @noname/server drizzle-kit push

# 5. Start the API server
pnpm dev
# → http://localhost:3000
# → http://localhost:3000/health
```

## Environment

Copy `.env.example` to `.env` at the project root:

| Variable | Default | Service |
|----------|---------|---------|
| `DATABASE_URL` | `postgres://noname:noname_dev@localhost:5432/app` | Postgres |
| `REDIS_URL` | `redis://localhost:6379` | DragonflyDB (Redis-compatible) |
| `CLICKHOUSE_URL` | `http://localhost:8123` | ClickHouse |
| `LOGTO_ENDPOINT` | `http://localhost:3001` | Logto auth |
| `OPENAI_API_KEY` | (optional) | Real LLM generation |
| `ANTHROPIC_API_KEY` | (optional) | Real LLM generation |

Copy `packages/server/.env.example` to `packages/server/.env` for R2/S3 asset storage config.

## Infrastructure

All services run via Docker Compose:

```bash
docker compose up -d         # start everything
docker compose ps            # check status
docker compose logs -f       # tail all logs
docker compose down -v       # tear down + delete data
```

| Service | Port | Purpose |
|---------|------|---------|
| **Postgres 16** | 5432 | Primary DB — JSONB content, ACID transactions |
| **DragonflyDB** | 6379 | Redis-compatible — cache + BullMQ queue backend |
| **ClickHouse** | 8123/9000 | Columnar analytics — event ingestion, aggregations |
| **Logto** | 3001/3002 | Self-hosted auth — OIDC, MFA, SSO |
| **S3 emulator** | 9000 | R2-compatible asset storage for local dev |
| **Jaeger** | 16686/4318 | OpenTelemetry tracing UI |

## Packages

```
noname/
├── packages/
│   ├── server/      → API server (Hono + Node.js) — 8 DDD domains
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
pnpm --filter @noname/server drizzle-kit push     # push schema to DB
pnpm --filter @noname/server drizzle-kit generate # generate migrations
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

## Edge Worker (`packages/workers`)

```bash
pnpm --filter @noname/workers dev    # start wrangler dev server
pnpm --filter @noname/workers deploy # deploy to Cloudflare
```

The Edge Worker calls the API server's `/api/edge/*` routes. It does NOT have direct DB access.
See `docs/2026-07-11/EDGE_WORKER.md` for architecture details.

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

All 8 domains follow Domain-Driven Design: `ports.ts` → `entity.ts` → `service.ts` → `adapters/postgres.ts` → `api.ts` → `index.ts`.
