import { createHash, randomUUID } from "node:crypto";
import { resolveLevel } from "./config";
import { loadManifestObservation } from "./observers/manifest";
import { CHECK_REGISTRY } from "./registry";
import type { AssertionConfig, Check, CheckContext, CheckResult, EvalResult } from "./types";

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

  for (const check of checks) {
    try {
      results.push(...(await check.run(runCtx)));
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

  const counts = { pass: 0, fail: 0, skip: 0, unverified: 0 };
  for (const result of adjusted) {
    counts[result.status] += 1;
    if (result.status === "skip" && result.level === "error") counts.unverified += 1;
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
