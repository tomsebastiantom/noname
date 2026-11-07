import { CHECK_REGISTRY } from "./registry";
import type { Check, CheckContext, EvalResult } from "./types";

export { browserChecks } from "./checks/browser";
export { manifestChecks } from "./checks/manifest";
export { routeChecks } from "./checks/routes";
export { createBrowserObserver } from "./observers/browser";
export { createHttpClient } from "./observers/http";
export { CHECK_REGISTRY } from "./registry";
export * from "./types";

/**
 * Run a set of checks and derive the verdict.
 *
 * `passed` is computed here and nowhere else: no `error`-level failure means passed. A check that
 * throws is reported as `skip`, never `pass` — silence is not success. Exported separately from
 * `evaluate` so tests (and future modes) can run a subset without rebuilding the registry.
 */
export async function evaluateChecks(
  checks: readonly Check[],
  ctx: CheckContext,
): Promise<EvalResult> {
  const results: EvalResult["checks"] = [];

  for (const check of checks) {
    try {
      results.push(...(await check.run(ctx)));
    } catch (cause) {
      results.push({
        id: check.meta.id,
        status: "skip",
        level: check.meta.defaultLevel,
        detail: `check crashed: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }

  const counts = { pass: 0, fail: 0, skip: 0 };
  for (const result of results) counts[result.status] += 1;

  const passed = !results.some((check) => check.status === "fail" && check.level === "error");
  return { checks: results, passed, counts };
}

/** Run the full catalogue. */
export async function evaluate(ctx: CheckContext): Promise<EvalResult> {
  return evaluateChecks(CHECK_REGISTRY, ctx);
}
