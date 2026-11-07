import { ValidationError } from "../../shared/domain-error";
import type { CreateReleaseInput, ReleaseArtifactInput, ReleaseArtifactKind } from "./ports";

const KINDS: readonly ReleaseArtifactKind[] = [
  "client_bundle",
  "server_image",
  "worker_image",
  "migration_set",
  "config",
];

/**
 * A release must be complete enough to be reproducible: a version pair and at least one digest-bound
 * artifact. Kinds are unique per release — two client bundles in one release has no defined meaning.
 */
export function validateCreateRelease(input: CreateReleaseInput): void {
  if (!input.platformVersion?.trim()) {
    throw new ValidationError("platformVersion", "must be a non-empty version");
  }
  if (!input.checksVersion?.trim()) {
    throw new ValidationError("checksVersion", "must be a non-empty version");
  }
  if (!Array.isArray(input.artifacts) || input.artifacts.length === 0) {
    throw new ValidationError("artifacts", "a release needs at least one artifact");
  }

  const seen = new Set<ReleaseArtifactKind>();
  for (const artifact of input.artifacts) {
    validateArtifact(artifact, seen);
  }
}

function validateArtifact(artifact: ReleaseArtifactInput, seen: Set<ReleaseArtifactKind>): void {
  if (!KINDS.includes(artifact.kind)) {
    throw new ValidationError(
      "artifacts[].kind",
      `unknown artifact kind: ${String(artifact.kind)}`,
    );
  }
  if (!artifact.ref?.trim()) {
    throw new ValidationError(`artifacts.${artifact.kind}.ref`, "must be a non-empty locator");
  }
  if (!artifact.digest?.trim() || artifact.digest.trim().length < 8) {
    throw new ValidationError(
      `artifacts.${artifact.kind}.digest`,
      "must be a content digest (at least 8 characters)",
    );
  }
  if (seen.has(artifact.kind)) {
    throw new ValidationError(
      `artifacts.${artifact.kind}`,
      "duplicate artifact kind in one release",
    );
  }
  seen.add(artifact.kind);
}
