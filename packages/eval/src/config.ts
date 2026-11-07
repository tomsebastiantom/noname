import type { AssertionConfig, Level, ResultLevel } from "./types";

/**
 * Resolve the effective level for one result.
 *
 * Order (later wins): catalogue default → `assertions[checkId]` → matching `assertMatrix` entries in order.
 * A malformed pattern is ignored rather than crashing the run; the check still has its default.
 */
export function resolveLevel(
  resultId: string,
  route: string | undefined,
  config: AssertionConfig | undefined,
  fallback: ResultLevel,
): Level {
  let level: Level = fallback;

  const direct = config?.assertions?.[resultId];
  if (direct) level = direct;

  if (route) {
    for (const entry of config?.assertMatrix ?? []) {
      let matches = false;
      try {
        matches = new RegExp(entry.matchingRoute).test(route);
      } catch {
        matches = false;
      }
      if (!matches) continue;
      const candidate = entry.assertions[resultId];
      if (candidate) level = candidate;
    }
  }

  return level;
}
