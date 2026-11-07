import { describe, expect, it } from "vitest";
import { classifyMigration, classifyMigrations, splitMigrationStatements } from "./classify";

describe("migration classifier", () => {
  it("splits Drizzle statements and strips comments", () => {
    const sql = [
      "-- header",
      'CREATE TABLE "a" ("id" uuid);',
      "--> statement-breakpoint",
      "-- backfill note",
      'INSERT INTO "a" ("id") VALUES (gen_random_uuid());',
    ].join("\n");

    expect(splitMigrationStatements(sql)).toEqual([
      'CREATE TABLE "a" ("id" uuid)',
      'INSERT INTO "a" ("id") VALUES (gen_random_uuid())',
    ]);
  });

  it("classifies additive DDL as expand", () => {
    const statements = classifyMigration(
      "0003.sql",
      [
        'CREATE TABLE "flags" ("id" uuid);',
        "--> statement-breakpoint",
        'ALTER TABLE "flags" ADD COLUMN "summary" text;',
        "--> statement-breakpoint",
        'CREATE UNIQUE INDEX "flags_summary" ON "flags" ("summary");',
      ].join("\n"),
    );

    expect(statements.map((statement) => statement.class)).toEqual(["expand", "expand", "expand"]);
  });

  it("classifies data movement as backfill", () => {
    const statements = classifyMigration(
      "0004.sql",
      [
        'UPDATE "flags" SET "summary" = "description" WHERE "summary" IS NULL;',
        "--> statement-breakpoint",
        'INSERT INTO "machine_definition_versions" ("id") SELECT gen_random_uuid();',
      ].join("\n"),
    );

    expect(statements.map((statement) => statement.class)).toEqual(["backfill", "backfill"]);
  });

  it.each([
    ['ALTER TABLE "flags" DROP COLUMN "description";', "DROP COLUMN"],
    ['ALTER TABLE "flags" RENAME COLUMN "description" TO "summary";', "RENAME COLUMN"],
    ['ALTER TABLE "flags" RENAME TO "feature_flags";', "RENAME TO"],
    ['ALTER TABLE "flags" ALTER COLUMN "id" TYPE text;', "ALTER COLUMN TYPE"],
    ['DROP TABLE "flags";', "DROP TABLE"],
    ['DROP TYPE "flag_type";', "DROP TYPE"],
    ['TRUNCATE "flags";', "TRUNCATE"],
    ['DELETE FROM "flags" WHERE "active" = false;', "DELETE FROM"],
    ['ALTER TABLE "flags" DROP CONSTRAINT "flags_key";', "DROP CONSTRAINT"],
  ])("blocks %s as destructive", (sql, reason) => {
    const [statement] = classifyMigration("0005.sql", sql);
    expect(statement).toMatchObject({ class: "destructive", reason });
  });

  it("blocks a mixed file if any statement is destructive", () => {
    const report = classifyMigrations([
      {
        file: "0006.sql",
        sql: [
          'ALTER TABLE "flags" ADD COLUMN "summary" text;',
          "--> statement-breakpoint",
          'ALTER TABLE "flags" DROP COLUMN "description";',
        ].join("\n"),
      },
    ]);

    expect(report.destructive).toBe(1);
    expect(report.promotable).toBe(false);
  });

  it("allows a purely additive/backfill set", () => {
    const report = classifyMigrations([
      {
        file: "0007.sql",
        sql: [
          'ALTER TABLE "flags" ADD COLUMN "summary" text;',
          "--> statement-breakpoint",
          'UPDATE "flags" SET "summary" = "description";',
        ].join("\n"),
      },
    ]);

    expect(report).toMatchObject({ destructive: 0, promotable: true });
  });

  it("does not treat unknown statements as a pass", () => {
    const [statement] = classifyMigration("0008.sql", 'COMMENT ON TABLE "flags" IS $$x$$;');
    expect(statement?.class).toBe("unknown");
  });
});
