import { createHmac, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  type AssertionConfig,
  type CheckCache,
  type CheckResult,
  computeChecksVersion,
  createBrowserObserver,
  createHttpClient,
  createServiceAccountToken,
  type EvalResult,
  evalBaseKey,
  evalRunKey,
  evaluate,
  isCacheableRun,
  loadRouteHashes,
  readTenantEvalKey,
} from "@noname/eval";
import { recordEvalReuse } from "../../shared/metrics";
import type { EvidenceService } from "../evidence/ports";
import { recordGateDecision } from "./gate";
import { createEvalResultStore } from "./results";

/**
 * One eval job = one tenant sweep, run off the request path.
 *
 * The worker mints a short-lived service token for the org, talks to the API over HTTP (never the database), and
 * records exactly one gate decision. `run` is an injection seam so the job logic can be tested without Redis,
 * HTTP or a browser.
 */
export type EvalJobData = {
  orgId: string;
  tenantSlug: string;
  config?: AssertionConfig;
  /** `sweep` may reuse clean passes; `gate` (default) never does. */
  mode?: "gate" | "sweep";
  releaseId?: string;
  platformVersion?: string;
  browserFleetVersion?: string;
  sampleLimit?: number;
};

export type EvalJobDeps = {
  evidence: EvidenceService;
  run?: () => Promise<EvalResult>;
  apiBase?: string;
  browserEndpoint?: string;
  siteBase?: string;
};

const MACHINES_DIR = fileURLToPath(
  new URL("../../../../../extensions/src/commerce/machines", import.meta.url),
);

export async function executeEvalJob(job: EvalJobData, deps: EvalJobDeps) {
  const result = deps.run ? await deps.run() : await evaluateForJob(job, deps);
  return recordGateDecision(deps.evidence, {
    orgId: job.orgId,
    tenantSlug: job.tenantSlug,
    result,
  });
}

async function evaluateForJob(job: EvalJobData, deps: EvalJobDeps): Promise<EvalResult> {
  const secret = process.env.WORKER_SERVER_SECRET ?? "";
  if (!secret) throw new Error("WORKER_SERVER_SECRET is required to run eval jobs");

  const issuer = process.env.ZITADEL_ISSUER ?? "http://localhost:8080";
  const projectId = process.env.ZITADEL_PROJECT_ID?.trim();
  if (!projectId) throw new Error("ZITADEL_PROJECT_ID is required to run eval jobs");

  const key = await readTenantEvalKey(job.orgId);
  const { accessToken, userId } = await createServiceAccountToken({
    key,
    issuer,
    projectId,
  });

  const hmac = createHmac("sha256", secret).update(`${job.orgId}:${userId}:service`).digest("base64");

  const client = createHttpClient({
    apiBase: deps.apiBase ?? process.env.EVAL_API_BASE ?? "http://127.0.0.1:3000",
    headers: {
      "x-org-id": job.orgId,
      "x-user-id": userId,
      "x-role": "service",
      "x-auth-hmac": hmac,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const ws = deps.browserEndpoint ?? process.env.EVAL_CDP_ENDPOINT;
  const siteBase =
    deps.siteBase ?? process.env.EVAL_SITE_BASE ?? `http://${job.tenantSlug}.localhost:5173`;

  const mode = job.mode ?? "gate";
  const releaseId = job.releaseId ?? process.env.EVAL_RELEASE_ID ?? "";
  const platformVersion = job.platformVersion ?? process.env.EVAL_PLATFORM_VERSION ?? "unknown";
  const browserFleetVersion =
    job.browserFleetVersion ?? process.env.EVAL_BROWSER_FLEET ?? "unknown";
  const sample =
    job.sampleLimit && job.sampleLimit > 0
      ? `${job.sampleLimit}:${new Date().toISOString().slice(0, 10)}`
      : "";

  // The worker reuses only for sweeps. A gate job never reads or writes the cache.
  const store = mode === "sweep" && releaseId ? createEvalResultStore() : null;
  let cacheKey: string | undefined;
  let cacheBaseKey: string | undefined;
  let checkCache: CheckCache | undefined;
  let routeHashes: Record<string, string> | undefined;
  let cached: EvalResult | null = null;

  if (store) {
    routeHashes = (await loadRouteHashes(client, job.tenantSlug)) ?? undefined;
    if (routeHashes) {
      const keyInputs = {
        orgId: job.orgId,
        tenantSlug: job.tenantSlug,
        releaseId,
        platformVersion,
        browserFleetVersion,
        checksVersion: computeChecksVersion(job.config),
        sample,
      };
      cacheKey = evalRunKey({ ...keyInputs, routeHashes });
      cacheBaseKey = evalBaseKey(keyInputs);
      cached = (await store.get(cacheKey)) as EvalResult | null;
      if (cached && !cached.passed) cached = null;
      checkCache = {
        async get(key: string) {
          return (await store.get(key)) as CheckResult[] | null;
        },
        async put(key: string, results: CheckResult[]) {
          await store.put(key, results);
        },
      };
    }
  }

  const browser = cached
    ? undefined
    : ws
      ? createBrowserObserver({ wsEndpoint: ws, origin: siteBase })
      : undefined;

  let result: EvalResult;
  if (cached) {
    result = {
      ...cached,
      // A reused result is a new run: keeping the cached runId would collide with the original Evidence
      // idempotency key and make the second decision look like the first one.
      runId: randomUUID(),
      reused: true,
      cacheKey,
      counts: { ...cached.counts, reused: cached.checks.length },
    };
  } else {
    try {
      result = await evaluate({
        client,
        tenantSlug: job.tenantSlug,
        machinesDir: process.env.EVAL_MACHINES_DIR ?? MACHINES_DIR,
        maxRoutes: 50,
        canReadDefinitions: true,
        browser,
        siteBase: browser ? siteBase : undefined,
        config: job.config,
        checkCache,
        cacheBaseKey,
        routeHashes,
        sampleLimit: job.sampleLimit && job.sampleLimit > 0 ? job.sampleLimit : undefined,
        sampleDay: job.sampleLimit ? new Date().toISOString().slice(0, 10) : undefined,
      });
    } finally {
      await browser?.close();
    }

    if (cacheKey) result = { ...result, cacheKey };
    if (store && cacheKey && isCacheableRun(result)) await store.put(cacheKey, result);
  }

  const reused = result.counts.reused ?? (cached ? result.checks.length : 0);
  recordEvalReuse({
    reused,
    computed: Math.max(0, result.checks.length - reused),
    gate: mode === "gate",
  });

  return result;
}
