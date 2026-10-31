import { createHmac } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The repository root `.env` is the single source of truth for identity (written by `pnpm init:zitadel`).
// Load it before anything reads process.env; dotenv never overrides values already in the environment.
import "dotenv/config";
import type { CheckResult } from "@noname/eval";
import { createHttpClient, evaluate } from "@noname/eval";

/**
 * `noname eval` — the thin CLI adapter (mode "dev" in the RFC's terms).
 *
 * It owns argument parsing, credentials and printing. It owns no check logic: everything comes from
 * `@noname/eval`, so the CLI and the future publish gate cannot disagree about what "verified" means.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../..");

type Options = {
  tenant: string;
  apiBase: string;
  machinesDir: string;
  maxRoutes: number;
  json: boolean;
};

function parseArgs(argv: string[]): Options {
  const get = (name: string, fallback: string): string => {
    const prefixed = `--${name}=`;
    const inline = argv.find((arg) => arg.startsWith(prefixed));
    if (inline) return inline.slice(prefixed.length);
    const index = argv.indexOf(`--${name}`);
    const next = index >= 0 ? argv[index + 1] : undefined;
    return next && !next.startsWith("--") ? next : fallback;
  };

  return {
    tenant: get("tenant", process.env.DEMO_STORE_SLUG ?? "yogastore"),
    apiBase: get("api-base", process.env.API_BASE ?? "http://localhost:3000"),
    machinesDir: get("machines-dir", join(ROOT, "packages/extensions/src/commerce/machines")),
    maxRoutes: Number(get("max-routes", "20")),
    json: argv.includes("--json"),
  };
}

/** Same HMAC shape the server middleware expects. */
function hmacHeaders(): Record<string, string> {
  const orgId = process.env.ZITADEL_DEMO_ORG_ID?.trim() ?? "";
  const secret = process.env.WORKER_SERVER_SECRET?.trim() ?? "";
  const userId = process.env.ZITADEL_DEMO_ADMIN_EMAIL?.trim() ?? "admin@zitadel.localhost";
  const headers: Record<string, string> = { "x-org-id": orgId };
  if (!orgId) {
    throw new Error("ZITADEL_DEMO_ORG_ID is missing — run `pnpm init:zitadel` or set it in .env");
  }
  if (!secret) return headers;
  const hmac = createHmac("sha256", secret).update(`${orgId}:${userId}:admin`).digest("base64");
  return { ...headers, "x-user-id": userId, "x-role": "admin", "x-auth-hmac": hmac };
}

/**
 * Some routes require an actual permission (`MACHINES_DEFINE`), which is resolved from a verified JWT's
 * project roles — an HMAC role string is not enough. The seeder hits the same requirement and solves it
 * the same way, so we reuse its helper rather than minting a second credential flow.
 *
 * Debt: this makes the CLI depend on a server module. When an agent/machine credential exists, this
 * should switch to a service-account assertion and drop the import.
 */
/**
 * Some routes (`/api/machines/definitions`) require a real permission (`MACHINES_DEFINE`), which is
 * resolved from a verified JWT — an HMAC role string is deliberately not enough. The CLI is a *built*
 * package (`rootDir: src`, bin `dist/index.js`), so it must not import server sources to mint one.
 *
 * Instead: accept a token. Without it, the definition checks report `skip` with the reason, never
 * `pass` — silence is not success.
 */
function readToken(argv: string[]): string | null {
  const prefixed = argv.find((arg) => arg.startsWith("--token="));
  if (prefixed) return prefixed.slice("--token=".length);
  const index = argv.indexOf("--token");
  const next = index >= 0 ? argv[index + 1] : undefined;
  const value = next && !next.startsWith("--") ? next : process.env.NONAME_EVAL_TOKEN;
  return value?.trim() ? value.trim() : null;
}
function format(results: CheckResult[]): string {
  const width = Math.max(...results.map((r) => r.id.length), 12);
  return results
    .map((result) => {
      const mark = result.status === "pass" ? "PASS" : result.status === "fail" ? "FAIL" : "SKIP";
      const subject = result.subject ? ` ${result.subject}` : "";
      return `  ${mark}  ${result.id.padEnd(width)}${subject}  ${result.detail}`;
    })
    .join("\n");
}

export async function evalCommand(argv: string[]): Promise<number> {
  const options = parseArgs(argv);
  const token = readToken(argv);
  const client = createHttpClient({
    apiBase: options.apiBase,
    headers: token ? { ...hmacHeaders(), Authorization: `Bearer ${token}` } : hmacHeaders(),
  });

  const result = await evaluate({
    client,
    tenantSlug: options.tenant,
    machinesDir: options.machinesDir,
    maxRoutes: Number.isFinite(options.maxRoutes) ? options.maxRoutes : 20,
    canReadDefinitions: Boolean(token),
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\n  eval — tenant "${options.tenant}" against ${options.apiBase}\n`);
    console.log(format(result.checks));
    const failed = result.checks.filter((c) => c.status === "fail").length;
    const passed = result.checks.filter((c) => c.status === "pass").length;
    const skipped = result.checks.filter((c) => c.status === "skip").length;
    console.log(`\n  ${passed} passed, ${failed} failed, ${skipped} skipped`);
  }

  return result.passed ? 0 : 1;
}
