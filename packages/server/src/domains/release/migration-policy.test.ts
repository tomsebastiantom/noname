import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConflictError } from "../../shared/domain-error";
import { assertMigrationsPromotable, migrationFilesFor } from "./migration-policy";
import type { ReleaseDTO, ReleaseState } from "./ports";

function releaseWith(ref: string): ReleaseDTO {
  const now = new Date();
  return {
    id: "r_1",
    orgId: "org-1",
    platformVersion: "v1",
    checksVersion: "c1",
    state: "ready" as ReleaseState,
    createdBy: "tom",
    createdAt: now,
    updatedAt: now,
    artifacts: [
      {
        id: "a-1",
        releaseId: "r_1",
        kind: "migration_set",
        ref,
        digest: "sha256:aaaaaaaa",
        createdAt: now,
      },
    ],
  };
}

describe("release migration policy", () => {
  it("allows an additive migration set", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-migrations-"));
    try {
      const file = join(dir, "0001_add.sql");
      writeFileSync(file, 'ALTER TABLE "flags" ADD COLUMN "summary" text;');

      expect(() => assertMigrationsPromotable(releaseWith(file))).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("blocks a destructive migration set", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-migrations-"));
    try {
      const file = join(dir, "0002_drop.sql");
      writeFileSync(file, 'ALTER TABLE "flags" DROP COLUMN "description";');

      expect(() => assertMigrationsPromotable(releaseWith(file))).toThrow(ConflictError);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not block an unresolvable ref — it cannot be verified", () => {
    expect(migrationFilesFor(releaseWith("0042-0043"))).toEqual([]);
    expect(() => assertMigrationsPromotable(releaseWith("0042-0043"))).not.toThrow();
  });

  it("accepts a comma-separated migration set", () => {
    const dir = mkdtempSync(join(tmpdir(), "release-migrations-"));
    try {
      const a = join(dir, "0003_expand.sql");
      const b = join(dir, "0004_backfill.sql");
      writeFileSync(a, 'ALTER TABLE "flags" ADD COLUMN "summary" text;');
      writeFileSync(b, 'UPDATE "flags" SET "summary" = "description";');

      expect(() => assertMigrationsPromotable(releaseWith(`${a},${b}`))).not.toThrow();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
