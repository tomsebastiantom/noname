import { createHash, randomUUID } from "node:crypto";
import "./contracts";
import { READ_ONLY_CACHEABLE_CHECKS } from "./cache";
import { resolveLevel } from "./config";
import { loadManifestObservation } from "./observers/manifest";
import { CHECK_REGISTRY } from "./registry";
import type { AssertionConfig, Check, CheckContext, CheckResult, EvalResult } from "./types";

export {
  type CheckCache,
  canonicalJson,
  evalBaseKey,
  evalCacheKey,
  evalRunKey,
  hashValue,
  isCacheableResult,
  isCacheableRun,
} from "./cache";
export { actionChecks } from "./checks/actions";
export { browserChecks } from "./checks/browser";
export { manifestChecks } from "./checks/manifest";
export { reachabilityChecks } from "./checks/reachability";
export { referenceChecks } from "./checks/references";
export { routeChecks } from "./checks/routes";
export { resolveLevel } from "./config";
export { createBrowserObserver } from "./observers/browser";
export { createHttpClient } from "./observers/http";
export { loadManifestObservation } from "./observers/manifest";
export { CHECK_REGISTRY } from "./registry";
export { computeRouteHashes, computeRouteHashesFromTree, loadRouteHashes } from "./route-hashes";
export {
  createServiceAccountToken,
  readTenantEvalKey,
  type ServiceAccountKey,
  VaultSecretNotFoundError,
  vaultConfigFromEnv,
  writeTenantEvalKey,
} from "./service-account";
export {
  clearVaultTokenCache,
  getVaultToken,
  type VaultAuthConfig,
  vaultAuthFromEnv,
} from "./vault-auth";
export { deterministicSample } from "./sampling";
export * from "./types";

/** Hash of the catalogue and configured levels — changes exactly when “what verified means” changes. */
function checksVersionOf(checks: readonly Check[], config?: AssertionConfig): string {
  const descriptor = checks.map((check) => ({
    id: check.meta.id,
    level: check.meta.defaultLevel,
    emits: check.meta.emits,
  }));
  return createHash("sha256")
    .update(JSON.stringify({ descriptor, config: config ?? null }))
    .digest("hex")
    .slice(0, 12);
}

/**
 * Run a set of checks and derive the verdict.
 *
 * `passed` is computed here and nowhere else: no `error`-level failure means passed. A check that
 * throws is reported as `skip`, never `pass` — silence is not success. Exported separately from
 * `evaluate` so tests (and future modes) can run a subset without rebuilding the registry.
 *
 * The runner — not a check — builds observations. Today that is the manifest observation; adding an
 * HTTP or browser observation follows the same shape.
 */
export async function evaluateChecks(
  checks: readonly Check[],
  ctx: CheckContext,
): Promise<EvalResult> {
  const needs = new Set(checks.flatMap((check) => check.meta.needs));
  let runCtx = ctx;

  if (needs.has("manifest") && !ctx.manifest) {
    try {
      runCtx = { ...ctx, manifest: await loadManifestObservation(ctx) };
    } catch (cause) {
      runCtx = {
        ...ctx,
        manifest: {
          files: [],
          stored: {},
          canReadDefinitions: ctx.canReadDefinitions,
          error: `manifest observation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
        },
      };
    }
  }

  const results: EvalResult["checks"] = [];
  let flaky = 0;

  for (const check of checks) {
    const homeCacheable =
      Boolean(ctx.checkCache && ctx.cacheBaseKey) &&
      check.meta.scope === "home" &&
      READ_ONLY_CACHEABLE_CHECKS.has(check.meta.id);

    if (homeCacheable) {
      const key = `${ctx.cacheBaseKey}:home:${ctx.routeHashes?.["/"] ?? ""}:${check.meta.id}`;
      const cached = await ctx.checkCache?.get(key);
      if (cached) {
        results.push(...cached.map((result) => ({ ...result, reused: true })));
        continue;
      }
    }

    try {
      const maxRetries = check.meta.retryable ? Math.max(0, ctx.config?.retries ?? 1) : 0;
      let attempts = 0;
      let checkResults: CheckResult[] = [];

      do {
        attempts += 1;
        checkResults = await check.run(runCtx);
        if (!checkResults.some((result) => result.status === "fail")) break;
      } while (attempts <= maxRetries);

      // A check that failed and then passed on retry is reported as pass, but counted as flaky: the
      // difference between “reliable” and “passed the second time” must stay visible.
      if (attempts > 1 && !checkResults.some((result) => result.status === "fail")) flaky += 1;

      results.push(
        ...(attempts > 1 ? checkResults.map((result) => ({ ...result, attempts })) : checkResults),
      );

      if (homeCacheable && checkResults.every((result) => result.status === "pass")) {
        const key = `${ctx.cacheBaseKey}:home:${ctx.routeHashes?.["/"] ?? ""}:${check.meta.id}`;
        await ctx.checkCache?.put(key, checkResults);
      }
    } catch (cause) {
      results.push({
        id: check.meta.id,
        status: "skip",
        level: check.meta.defaultLevel,
        detail: `check crashed: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }

  const adjusted: CheckResult[] = [];
  for (const result of results) {
    const level = resolveLevel(result.id, result.subject, ctx.config, result.level);
    if (level === "off") continue;
    adjusted.push({ ...result, level });
  }

  const counts = { pass: 0, fail: 0, skip: 0, unverified: 0, flaky, reused: 0 };
  for (const result of adjusted) {
    counts[result.status] += 1;
    if (result.status === "skip" && result.level === "error") counts.unverified += 1;
    if (result.reused) counts.reused += 1;
  }

  const passed = !adjusted.some((check) => check.status === "fail" && check.level === "error");
  return {
    checks: adjusted,
    passed,
    counts,
    runId: ctx.runId ?? randomUUID(),
    checksVersion: checksVersionOf(checks, ctx.config),
  };
}

/** Run the full catalogue. */
export async function evaluate(ctx: CheckContext): Promise<EvalResult> {
  return evaluateChecks(CHECK_REGISTRY, ctx);
}

/** Catalogue + config fingerprint, exposed so a caller can compute the cache key before running. */
export function computeChecksVersion(config?: AssertionConfig): string {
  return checksVersionOf(CHECK_REGISTRY, config);
}
