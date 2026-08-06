/** Merge partial orchestrate snapshots for live task polling (append steps, keep latest summary). */
export function mergeOrchestrateProgress(
  previous: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const prevSteps = Array.isArray(previous.steps) ? previous.steps : [];
  const nextSteps = Array.isArray(next.steps) ? next.steps : [];
  const stepByIndex = new Map<number, Record<string, unknown>>();

  for (const step of [...prevSteps, ...nextSteps]) {
    if (!step || typeof step !== "object" || Array.isArray(step)) continue;
    const record = step as Record<string, unknown>;
    if (typeof record.index !== "number") continue;
    stepByIndex.set(record.index, record);
  }

  const mergedSteps = [...stepByIndex.values()].sort(
    (left, right) => (left.index as number) - (right.index as number),
  );

  const nextSummary = typeof next.summary === "string" ? next.summary.trim() : "";
  const prevSummary = typeof previous.summary === "string" ? previous.summary.trim() : "";
  const nextArtifacts = Array.isArray(next.artifacts) ? next.artifacts : null;
  const prevArtifacts = Array.isArray(previous.artifacts) ? previous.artifacts : [];

  return {
    ...previous,
    ...next,
    summary: nextSummary || prevSummary,
    steps: mergedSteps,
    artifacts: nextArtifacts && nextArtifacts.length > 0 ? nextArtifacts : prevArtifacts,
    diagnostics: next.diagnostics ?? previous.diagnostics,
  };
}
