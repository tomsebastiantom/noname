#!/usr/bin/env node
/**
 * Generate `.env.cluster` — the env file the Kubernetes Secret is built from.
 *
 * Why this exists: the server reads TWO env files (`packages/server/src/load-env.ts`), the repository
 * root `.env` first and the package-local `packages/server/.env` for server-scoped additions such as the
 * R2/S3 asset-storage config. A container image cannot carry either (they hold credentials and stale
 * localhost URLs), so the cluster needs a single flattened file whose URLs point at Service DNS.
 *
 * Rewrite rules:
 *   - every `localhost:<port>` / `127.0.0.1:<port>` becomes the Kubernetes Service that serves it;
 *   - **ZITADEL stays on localhost:8080** on purpose: tokens carry that issuer and pods reach it through
 *     the `localhost-proxy` socat sidecar (see deploy/app/api.yaml). Rewriting it would invalidate every
 *     token.
 *
 * Regenerate after `pnpm init:zitadel` (it rewrites .env with new org/client IDs) and after any URL
 * change, then:
 *   kubectl -n noname create secret generic noname-env --from-env-file=.env.cluster \
 *     --dry-run=client -o yaml | kubectl apply -f -
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SERVICE_BY_PORT = {
  "5432": "postgres:5432",
  "6379": "dragonfly:6379",
  "8123": "clickhouse:8123",
  // compose maps 9001 -> clickhouse's native 9000; in-cluster the collision with s3rver is gone
  "9001": "clickhouse:9000",
  "9000": "s3:9000",
  "8200": "vault:8200",
  "4466": "keto:4466",
  "4467": "keto:4467",
  "4468": "keto:4468",
  "3003": "nango:3003",
  "3009": "nango:3009",
  "4318": "jaeger:4318",
};

/** Ports that must NOT be rewritten — see the header. */
const KEEP_LOCAL_PORTS = new Set(["8080"]);

function rewrite(text) {
  return text.replace(/\b(?:localhost|127\.0\.0\.1):(\d+)\b/g, (match, port) => {
    if (KEEP_LOCAL_PORTS.has(port)) return match;
    return SERVICE_BY_PORT[port] ?? match;
  });
}

function keysOf(text) {
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1])
      .filter(Boolean),
  );
}

const root = existsSync(".env") ? rewrite(readFileSync(".env", "utf8")) : "";
const pkg = existsSync("packages/server/.env")
  ? rewrite(readFileSync("packages/server/.env", "utf8"))
  : "";

if (!root.trim()) {
  console.error("no .env at the repository root — run `pnpm init:zitadel` first");
  process.exit(1);
}

// Root wins on conflict, matching load-env.ts; package-local adds only genuinely missing keys.
const rootKeys = keysOf(root);
const extras = pkg
  .split(/\r?\n/)
  .filter((line) => {
    const key = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1];
    return key && !rootKeys.has(key);
  });

let merged = `${root.trimEnd()}\n${extras.join("\n")}\n`;
if (!/^OTEL_EXPORTER_OTLP_ENDPOINT=/m.test(merged)) {
  merged += "OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318\n";
}

writeFileSync(".env.cluster", merged, "utf8");

const total = [...keysOf(merged)].length;
console.log(`wrote .env.cluster — ${total} keys (${extras.length} added from packages/server/.env)`);
const loopback = merged
  .split(/\r?\n/)
  .filter((line) => /(?:localhost|127\.0\.0\.1):/.test(line))
  .map((line) => `  ${line.replace(/=.*/, "=…")}`);
console.log(
  loopback.length ? `still pointing at loopback (expected: zitadel only):\n${loopback.join("\n")}` : "no loopback URLs",
);
