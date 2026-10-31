# App image (API + worker share one image; the command differs).
#
# This is a **dev-grade** image on purpose: it runs the TypeScript entrypoints through tsx from the
# real source tree rather than a compiled `dist/`. That keeps the move into Kubernetes honest and fast
# while the checks are still being built, and it avoids pretending a production build pipeline exists
# before it does. Tracked in the migration status doc as a follow-up: `tsc` build + pruned prod deps.
#
# Build context is the REPOSITORY ROOT (see deploy/app/.dockerignore):
#   podman build -f deploy/app/server.Containerfile -t localhost/noname-api:dev .
FROM node:24-bookworm-slim

ENV NODE_ENV=development \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable && \
    apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependency manifests first so the install layer is cached across source edits.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/server/package.json packages/server/
COPY packages/auth/package.json packages/auth/
COPY packages/shared/package.json packages/shared/
COPY packages/documents/package.json packages/documents/
COPY packages/verticals/package.json packages/verticals/
COPY packages/extensions/package.json packages/extensions/
COPY packages/seeding/package.json packages/seeding/
COPY packages/fixtures/package.json packages/fixtures/
COPY packages/browser-sdk/package.json packages/browser-sdk/
COPY packages/cli/package.json packages/cli/
COPY packages/eval/package.json packages/eval/
# `seeding` depends on `@noname/client`, and `workers` is needed by the edge build; without their
# package.json files pnpm does not create their node_modules, and the seeder then fails at runtime with
# ERR_MODULE_NOT_FOUND for a dependency of the client package (observed: zod).
COPY packages/client/package.json packages/client/
COPY packages/workers/package.json packages/workers/
RUN pnpm install --frozen-lockfile || pnpm install

# Then the sources.
COPY . .

# The server resolves the repository root for env/asset lookups, and `load-env` reads .env from there;
# in the cluster the environment comes from a Secret instead, so nothing is baked in.
WORKDIR /app/packages/server
EXPOSE 3000
CMD ["pnpm", "exec", "tsx", "src/index.ts"]
