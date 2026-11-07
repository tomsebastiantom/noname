import "dotenv/config";
import { isPermissionKey, type PermissionKey } from "@noname/auth";
import { signServiceToken } from "../packages/server/src/shared/service-token";

/**
 * Mint a service token for local verification.
 *
 *   pnpm exec tsx scripts/mint-service-token.ts --org <orgId> [--service eval] [--ttl 3600]
 *
 * The token is printed to stdout and nothing else, so it can be captured:
 *   $token = pnpm exec tsx scripts/mint-service-token.ts --org ... | Select-Object -Last 1
 *
 * Permissions default to `machines:read` — the eval service reads definitions and must never be able to
 * write them. Signing uses SERVICE_TOKEN_SECRET, falling back to WORKER_SERVER_SECRET for local setups.
 */

function arg(name: string, fallback?: string): string | undefined {
  const inline = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  const next = index >= 0 ? process.argv[index + 1] : undefined;
  return next && !next.startsWith("--") ? next : fallback;
}

const orgId = arg("org")?.trim();
if (!orgId) {
  console.error("usage: mint-service-token --org <orgId> [--service eval] [--permissions machines:read] [--ttl 3600]");
  process.exit(2);
}

const serviceId = arg("service", "eval")!.trim();
const ttlSeconds = Number(arg("ttl", "3600"));
if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
  console.error("--ttl must be a positive number of seconds");
  process.exit(2);
}

const rawPermissions = (arg("permissions", "machines:read") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const permissions: PermissionKey[] = [];
for (const value of rawPermissions) {
  if (!isPermissionKey(value)) {
    console.error(`unknown permission: ${value}`);
    process.exit(2);
  }
  permissions.push(value);
}

const token = signServiceToken({
  serviceId,
  orgId,
  permissions,
  exp: Math.floor(Date.now() / 1000) + ttlSeconds,
});

process.stdout.write(`${token}\n`);
