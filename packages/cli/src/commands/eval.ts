import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// The repository root `.env` is the single source of truth for identity (written by `pnpm init:zitadel`).
// Load it before anything reads process.env; dotenv never overrides values already in the environment.
import "dotenv/config";
import type { AssertionConfig, CheckCache, CheckResult, EvalResult } from "@noname/eval";
import {
  computeChecksVersion,
  createBrowserObserver,
  createHttpClient,
  evalBaseKey,
  evalRunKey,
  evaluate,
  isCacheableRun,
  loadRouteHashes,
} from "@noname/eval";

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
  browserEndpoint?: string;
  siteBase?: string;
  configPath?: string;
  mode: "dev" | "gate" | "agent";
  drafts: boolean;
  noCache: boolean;
  sampleLimit: number;
  releaseId: string;
  platformVersion: string;
  browserFleetVersion: string;
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
    browserEndpoint: get("browser-endpoint", process.env.EVAL_CDP_ENDPOINT ?? "") || undefined,
    siteBase: get("site", "") || undefined,
    configPath: get("config", "") || undefined,
    mode: get("mode", "dev") as Options["mode"],
    drafts: argv.includes("--drafts"),
    noCache: argv.includes("--no-cache"),
    sampleLimit: Number(get("sample", "0")) || 0,
    releaseId: get("release", process.env.EVAL_RELEASE_ID ?? "") || "",
    platformVersion: get("platform-version", process.env.EVAL_PLATFORM_VERSION ?? "unknown"),
    browserFleetVersion: get("browser-fleet", process.env.EVAL_BROWSER_FLEET ?? "unknown"),
    json: argv.includes("--json"),
  };
}

/** Same HMAC shape the server middleware expects. */
function hmacHeaders(): Record<string, string> {
  const orgId = process.env.ZITADEL_DEMO_ORG_ID?.trim() ?? "";
  const secret = process.env.WORKER_SERVER_SECRET?.trim() ?? "";
  // The edge HMAC is transport attestation, not a human login: identify the eval worker, never an admin person.
  const userId = "eval-worker";
  const headers: Record<string, string> = { "x-org-id": orgId };
  if (!orgId) {
    throw new Error("ZITADEL_DEMO_ORG_ID is missing — run `pnpm init:zitadel` or set it in .env");
  }
  if (!secret) return headers;
  const hmac = createHmac("sha256", secret).update(`${orgId}:${userId}:service`).digest("base64");
  return { ...headers, "x-user-id": userId, "x-role": "service", "x-auth-hmac": hmac };
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
  if (!["dev", "gate", "agent"].includes(options.mode)) {
    console.error(`unknown --mode "${options.mode}" (expected dev, gate or agent)`);
    return 2;
  }
  if (options.drafts && options.mode !== "dev") {
    console.error("--drafts is a dev-mode policy: a gate must verify what customers see");
    return 2;
  }
  if (options.sampleLimit > 0 && options.mode === "gate") {
    console.error("--sample is a sweep policy: a gate must verify every route, not a sample");
    return 2;
  }
  const token = readToken(argv);

  let config: AssertionConfig | undefined;
  if (options.configPath) {
    try {
      config = JSON.parse(readFileSync(options.configPath, "utf8")) as AssertionConfig;
    } catch (cause) {
      console.error(
        `could not read --config ${options.configPath}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      return 2;
    }
  }

  const client = createHttpClient({
    apiBase: options.apiBase,
    headers: token ? { ...hmacHeaders(), Authorization: `Bearer ${token}` } : hmacHeaders(),
  });
  const sampleDay = new Date().toISOString().slice(0, 10);

  // Cache policy: the gate never reuses; everything else reuses only a clean pass whose inputs are unchanged.
  const noCache = options.noCache || options.mode === "gate";
  const authHeaders = {
    ...hmacHeaders(),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  let cacheKey: string | undefined;
  let cacheBaseKey: string | undefined;
  let checkCache: CheckCache | undefined;
  let routeHashes: Record<string, string> | undefined;
  let cached: EvalResult | null = null;

  if (!noCache && options.releaseId) {
    routeHashes = (await loadRouteHashes(client, options.tenant)) ?? undefined;
    if (routeHashes) {
      const orgId = process.env.ZITADEL_DEMO_ORG_ID?.trim() ?? "";
      const checksVersion = computeChecksVersion(config);
      const keyInputs = {
        orgId,
        tenantSlug: options.tenant,
        releaseId: options.releaseId,
        platformVersion: options.platformVersion,
        browserFleetVersion: options.browserFleetVersion,
        checksVersion,
        sample: options.sampleLimit > 0 ? `${options.sampleLimit}:${sampleDay}` : "",
      };
      cacheKey = evalRunKey({ ...keyInputs, routeHashes });
      cacheBaseKey = evalBaseKey(keyInputs);

      const base = options.apiBase.replace(/\/$/, "");
      checkCache = {
        async get(key: string): Promise<CheckResult[] | null> {
          try {
            const response = await fetch(`${base}/api/eval/checks/${encodeURIComponent(key)}`, {
              headers: authHeaders,
            });
            if (!response.ok) return null;
            const body = (await response.json()) as { data?: { results?: CheckResult[] } };
            return body.data?.results ?? null;
          } catch {
            return null;
          }
        },
        async put(key: string, results: CheckResult[]): Promise<void> {
          await fetch(`${base}/api/eval/checks/${encodeURIComponent(key)}`, {
            method: "PUT",
            headers: { ...authHeaders, "content-type": "application/json" },
            body: JSON.stringify(results),
          }).catch(() => undefined);
        },
      };

      try {
        const response = await fetch(`${base}/api/eval/results/${cacheKey}`, {
          headers: authHeaders,
        });
        if (response.ok) {
          const body = (await response.json()) as { data?: { result?: EvalResult } };
          if (body.data?.result?.passed) cached = body.data.result;
        }
      } catch {
        cached = null;
      }
    }
  }

  const browser = cached
    ? undefined
    : options.browserEndpoint
      ? createBrowserObserver({
          wsEndpoint: options.browserEndpoint,
          origin: options.siteBase ?? `http://${options.tenant}.localhost:5173`,
        })
      : undefined;

  let result: EvalResult;
  if (cached) {
    result = {
      ...cached,
      reused: true,
      cacheKey,
      counts: { ...cached.counts, reused: cached.checks.length },
    };
  } else {
    try {
      result = await evaluate({
        client,
        tenantSlug: options.tenant,
        machinesDir: options.machinesDir,
        maxRoutes: Number.isFinite(options.maxRoutes) ? options.maxRoutes : 20,
        canReadDefinitions: Boolean(token),
        includeDrafts: options.drafts,
        browser,
        sampleLimit: options.sampleLimit > 0 ? options.sampleLimit : undefined,
        sampleDay: options.sampleLimit > 0 ? sampleDay : undefined,
        checkCache,
        cacheBaseKey,
        routeHashes,
        siteBase: browser
          ? (options.siteBase ?? `http://${options.tenant}.localhost:5173`)
          : undefined,
        config,
      });
    } finally {
      await browser?.close();
    }

    if (cacheKey) result = { ...result, cacheKey };
    if (!noCache && cacheKey && isCacheableRun(result)) {
      void fetch(`${options.apiBase.replace(/\/$/, "")}/api/eval/results/${cacheKey}`, {
        method: "PUT",
        headers: { ...authHeaders, "content-type": "application/json" },
        body: JSON.stringify(result),
      }).catch(() => undefined);
    }
  }

  // Report reuse/computed so the server can expose the saving as metrics (gate reuse must stay 0).
  const reusedCount = result.counts.reused ?? 0;
  void fetch(`${options.apiBase.replace(/\/$/, "")}/api/eval/reuse`, {
    method: "POST",
    headers: { ...authHeaders, "content-type": "application/json" },
    body: JSON.stringify({
      reused: reusedCount,
      computed: Math.max(0, result.checks.length - reusedCount),
      gate: options.mode === "gate",
    }),
  }).catch(() => undefined);

  let evidenceId: string | undefined;
  let decision: string | undefined;
  if (options.mode === "gate") {
    try {
      const response = await fetch(`${options.apiBase.replace(/\/$/, "")}/api/eval/record`, {
        method: "POST",
        headers: {
          ...hmacHeaders(),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "content-type": "application/json",
        },
        body: JSON.stringify({ tenantSlug: options.tenant, result }),
      });
      if (!response.ok) {
        console.error(`gate record failed: HTTP ${response.status}`);
        return 1;
      }
      const body = (await response.json()) as {
        data?: { evidenceId?: string; decision?: string };
      };
      evidenceId = body.data?.evidenceId;
      decision = body.data?.decision;
    } catch (cause) {
      console.error(
        `gate record failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      return 1;
    }
  }

  if (options.json) {
    console.log(JSON.stringify({ ...result, evidenceId, decision }, null, 2));
  } else {
    console.log(`\n  eval — tenant "${options.tenant}" against ${options.apiBase}\n`);
    console.log(format(result.checks));
    const failed = result.checks.filter((c) => c.status === "fail").length;
    const passed = result.checks.filter((c) => c.status === "pass").length;
    const skipped = result.checks.filter((c) => c.status === "skip").length;
    const unverified = result.counts.unverified;
    const flaky = result.counts.flaky;
    console.log(
      `\n  ${passed} passed, ${failed} failed, ${skipped} skipped${unverified > 0 ? ` (${unverified} unverified)` : ""}${flaky > 0 ? ` (${flaky} flaky)` : ""}`,
    );
    if (evidenceId) console.log(`  evidence: ${evidenceId} (${decision ?? "recorded"})`);
  }

  // Mode policy: `agent` reports to its caller and never sets a failing exit code; `dev` and `gate` block.
  if (options.mode === "agent") return 0;
  return result.passed ? 0 : 1;
}
