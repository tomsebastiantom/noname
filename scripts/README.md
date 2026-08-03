# Scripts

Local dev helpers grouped by when they run.

## Layout

```
scripts/
├── compose/          # Docker Compose hooks (automatic)
│   ├── init-dbs.sh           # First postgres boot: create zitadel, nango, keto DBs
│   └── ensure-extra-dbs.sh   # Every compose up: idempotent DB + extension setup
├── init/             # One-time setup (manual)
│   └── zitadel-oidc.ts       # pnpm init:zitadel — OIDC app + .env + wrangler.toml
└── seed/             # Demo data (manual, API must be running)
    ├── demo.ts               # pnpm seed:demo — layouts, admin, users, Keto scope
    ├── demo-commerce.ts      # pnpm seed:demo:commerce — optional commerce extension
    ├── demo-users.ts         # Team users module (imported by demo.ts)
    ├── keto-tuples.ts        # Keto tuple helpers (imported by demo.ts)
    └── assets/idp/           # SVG icons uploaded during seed
```

## What runs when

| When | Script | Command / trigger |
|------|--------|-------------------|
| First `podman compose up` (fresh postgres volume) | `compose/init-dbs.sh` | Mounted into postgres init |
| Every `podman compose up` | `compose/ensure-extra-dbs.sh` | `postgres-init-dbs` service |
| Once per machine / after ZITADEL reset | `init/zitadel-oidc.ts` | `pnpm init:zitadel` |
| After API + DB ready | `seed/demo.ts` | `pnpm seed:demo` |
| Optional storefront demo | `seed/demo-commerce.ts` | `pnpm seed:demo:commerce` |

S3 bucket creation is inline in `docker-compose.yml` (`s3-init` service), not a separate script.

## Typical local flow

```bash
podman compose up -d
pnpm init:zitadel                    # once
pnpm --filter @noname/server db:push # if fresh DB
pnpm dev                             # API on :3000
pnpm seed:demo
pnpm seed:demo:commerce              # optional
```

## Demo users (after `pnpm seed:demo`)

| User | Password | Access |
|------|----------|--------|
| `admin@zitadel.localhost` | from `.env` | Admin + all documents |
| `editor@zitadel.localhost` | `NonameEditor1!` | Editor + all documents |
| `marketing@zitadel.localhost` | `NonameMarketing1!` | Tag `marketing` only |
