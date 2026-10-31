import { manifestChecks } from "./checks/manifest";
import { routeChecks } from "./checks/routes";
import type { CheckContext, EvalResult } from "./types";

export { manifestChecks } from "./checks/manifest";
export { routeChecks } from "./checks/routes";
export { createHttpClient } from "./observers/http";
export * from "./types";

const ALL_CHECKS = [...manifestChecks, ...routeChecks];

/**
 * Run the checks and derive the verdict.
 *
 * `passed` is computed here and nowhere else: no `error`-level failure means passed. A check that throws
 * is reported as `skip`, never `pass` — silence is not success.
 */
export async function evaluate(ctx: CheckContext): Promise<EvalResult> {
  const checks: EvalResult["checks"] = [];

  for (const check of ALL_CHECKS) {
    try {
      checks.push(...(await check.run(ctx)));
    } catch (cause) {
      checks.push({
        id: check.id,
        status: "skip",
        level: "error",
        detail: `check crashed: ${cause instanceof Error ? cause.message : String(cause)}`,
      });
    }
  }

  const passed = !checks.some((check) => check.status === "fail" && check.level === "error");
  return { checks, passed };
}
