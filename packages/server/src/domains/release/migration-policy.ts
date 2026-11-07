import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { ConflictError } from "../../shared/domain-error";
import { classifyMigrations } from "./migrations/classify";
import type { ReleaseDTO } from "./ports";

/** Expand a `migration_set` artifact ref into files that exist on disk. Refs that cannot be resolved are skipped. */
export function migrationFilesFor(release: ReleaseDTO): string[] {
  return release.artifacts
    .filter((artifact) => artifact.kind === "migration_set")
    .flatMap((artifact) => artifact.ref.split(","))
    .map((ref) => ref.trim())
    .filter(Boolean)
    .map((ref) => (isAbsolute(ref) ? ref : resolve(process.cwd(), ref)))
    .filter((file) => existsSync(file));
}

/**
 * Refuse a release whose migration set is destructive (D16) at promotion time.
 *
 * If the ref cannot be resolved to files, the release is not blocked: the classifier cannot see the SQL, and the
 * gate records that limit rather than pretending it verified anything.
 */
export function assertMigrationsPromotable(release: ReleaseDTO): void {
  const files = migrationFilesFor(release);
  if (files.length === 0) return;

  const report = classifyMigrations(
    files.map((file) => ({ file, sql: readFileSync(file, "utf8") })),
  );
  if (report.promotable) return;

  throw new ConflictError(`Release ${release.id} contains a destructive migration set`, {
    id: release.id,
    destructive: report.statements
      .filter((statement) => statement.class === "destructive")
      .map((statement) => statement.reason),
  });
}
