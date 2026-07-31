import type { EvaluationResult } from "../flags/ports";

export function evaluationsToFlagMap(evaluations: EvaluationResult[]): Record<string, unknown> {
  const flagMap: Record<string, unknown> = {};
  for (const evaluation of evaluations) {
    flagMap[evaluation.flagKey] = evaluation.value;
  }
  return flagMap;
}
