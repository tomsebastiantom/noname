/**
 * Environment loading with a single source of truth.
 *
 * `dotenv/config` loads `.env` from the current working directory only. The
 * server is normally started with `pnpm --filter @noname/server dev`, whose cwd
 * is `packages/server`, so a duplicated `packages/server/.env` silently shadowed
 * the repository root `.env`.
 *
 * That duplicate drifted: `pnpm init:zitadel` rewrites the root `.env`, leaving
 * `packages/server/.env` with a stale `ZITADEL_CLIENT_ID`. Nothing at the origin
 * read that value until origin-side token verification added an audience check,
 * at which point every legitimate access token was rejected.
 *
 * Load the repository root FIRST so it wins on conflict, then the package-local
 * file for genuinely server-scoped additions (R2/S3 storage config). Shell
 * variables always win, because dotenv never overrides existing values.
 *
 * This module performs the load as a side effect, so it must be imported before
 * any module that reads `process.env` at import time (for example
 * `shared/org.ts`, which captures WORKER_SERVER_SECRET at module scope).
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config } from "dotenv";

const cwd = process.cwd();
const candidates = [
  // Repository root when the cwd is packages/server (the normal dev path).
  resolve(cwd, "../../.env"),
  // Package-local additions, or the root .env itself when cwd is the repo root.
  resolve(cwd, ".env"),
];

const loaded = new Set<string>();
for (const path of candidates) {
  if (loaded.has(path) || !existsSync(path)) continue;
  loaded.add(path);
  config({ path, override: false });
}
