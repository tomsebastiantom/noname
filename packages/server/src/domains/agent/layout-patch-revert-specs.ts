import type { AgentTaskDTO } from "./ports";

export type LayoutPatchRevertTarget = {
  layoutDocumentId: string;
  revertSpec: Record<string, unknown>;
  label: string;
};

/** Read layout revert payloads from stored task output (avoid schema stripping). */
export function layoutPatchRevertTargetsFromTask(
  task: Pick<AgentTaskDTO, "output">,
): LayoutPatchRevertTarget[] {
  const output = task.output;
  if (!output || typeof output !== "object" || !Array.isArray(output.artifacts)) {
    return [];
  }

  const targets: LayoutPatchRevertTarget[] = [];
  for (const item of output.artifacts) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const artifact = item as Record<string, unknown>;
    if (artifact.kind !== "layout" || typeof artifact.documentId !== "string") continue;
    const revertSpec = artifact.revertSpec;
    if (!revertSpec || typeof revertSpec !== "object" || Array.isArray(revertSpec)) continue;
    targets.push({
      layoutDocumentId: artifact.documentId,
      revertSpec: revertSpec as Record<string, unknown>,
      label: typeof artifact.label === "string" ? artifact.label : "layout",
    });
  }
  return targets;
}
