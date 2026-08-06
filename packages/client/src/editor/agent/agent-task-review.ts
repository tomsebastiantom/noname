import type { OrchestrateOutput } from "../../auth/agents";

function layoutArtifactForPage(
  orchestrate: OrchestrateOutput,
  layoutDocumentId: string,
) {
  return orchestrate.artifacts.find(
    (artifact) => artifact.kind === "layout" && artifact.documentId === layoutDocumentId,
  );
}

/** Live editor patch on the open page — offer Undo (reject reverts canvas). */
export function taskShowsLiveUndo(
  orchestrate: OrchestrateOutput | null | undefined,
  layoutDocumentId: string | null | undefined,
): boolean {
  if (!orchestrate || !layoutDocumentId) return false;
  const artifact = layoutArtifactForPage(orchestrate, layoutDocumentId);
  if (!artifact?.revertSpec) return false;
  return artifact.liveEditorPatch !== false;
}

/** Cold-path drafts (not the open live canvas) still use Approve/Reject. */
export function taskNeedsColdReview(
  orchestrate: OrchestrateOutput | null | undefined,
  layoutDocumentId: string | null | undefined,
): boolean {
  if (!orchestrate) return false;
  return orchestrate.artifacts.some((artifact) => {
    if (artifact.kind === "layout" && artifact.documentId === layoutDocumentId) {
      return artifact.liveEditorPatch === false || !artifact.revertSpec;
    }
    return true;
  });
}

/** @deprecated Prefer taskShowsLiveUndo / taskNeedsColdReview in the editor. */
export function taskNeedsHumanReview(orchestrate: OrchestrateOutput | null | undefined): boolean {
  if (!orchestrate) return false;
  return orchestrate.artifacts.length > 0;
}
