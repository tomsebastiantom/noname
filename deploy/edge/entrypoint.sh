#!/bin/sh
# Seed the local (emulated) R2 bucket with the built client, then start the worker.
#
# Why: the edge serves the SPA out of R2 — `/_assets/*` and the `/` fallback both read
# `env.R2.get("_assets/index.html")` (packages/workers/src/routes/static.ts and storefront.ts). With an empty
# bucket every page request falls through to 503. In production the deploy pipeline uploads the client build
# to R2, so the bucket is never empty; locally nothing does that, which is exactly why the edge "worked but
# returned 503".
#
# `wrangler dev --local` and `wrangler r2 object put --local` share the same persisted state directory inside
# the container, so seeding before start is enough.
set -e

DIST=/app/packages/client/dist
BUCKET=noname-assets

if [ ! -f "$DIST/index.html" ]; then
  echo "edge: no client build at $DIST — the SPA fallback will 503" >&2
else
  cd "$DIST"
  # Upload every built file under the _assets/ prefix the worker expects.
  find . -type f | while read -r file; do
    key="_assets/${file#./}"
    /app/packages/workers/node_modules/.bin/wrangler r2 object put "$BUCKET/$key" --file="$DIST/${file#./}" --local >/dev/null 2>&1 \
      || echo "edge: failed to seed $key" >&2
  done
  echo "edge: seeded $BUCKET from $DIST"
fi

cd /app/packages/workers
exec /app/packages/workers/node_modules/.bin/wrangler dev --local \
  --ip 0.0.0.0 --port 8787 \
  --var API_ORIGIN:"${API_ORIGIN:-http://api:3000}" \
  --var WORKER_SERVER_SECRET:"${WORKER_SERVER_SECRET}"
