export type MigrationClass = "expand" | "backfill" | "destructive" | "unknown";

export type ClassifiedStatement = {
  file: string;
  index: number;
  sql: string;
  class: MigrationClass;
  reason: string;
};

export type MigrationReport = {
  statements: ClassifiedStatement[];
  destructive: number;
  promotable: boolean;
};

const DESTRUCTIVE: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bdrop\s+table\b/i, reason: "DROP TABLE" },
  { pattern: /\bdrop\s+column\b/i, reason: "DROP COLUMN" },
  { pattern: /\brename\s+column\b/i, reason: "RENAME COLUMN" },
  { pattern: /\brename\s+to\b/i, reason: "RENAME TO" },
  { pattern: /\balter\s+column\b[\s\S]*\btype\b/i, reason: "ALTER COLUMN TYPE" },
  { pattern: /\bdrop\s+type\b/i, reason: "DROP TYPE" },
  { pattern: /\btruncate\b/i, reason: "TRUNCATE" },
  { pattern: /\bdelete\s+from\b/i, reason: "DELETE FROM" },
  { pattern: /\bdrop\s+constraint\b/i, reason: "DROP CONSTRAINT" },
];

const EXPAND: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /^create\s+table\b/i, reason: "CREATE TABLE" },
  { pattern: /^create\s+type\b/i, reason: "CREATE TYPE" },
  { pattern: /^create\s+(unique\s+)?index\b/i, reason: "CREATE INDEX" },
  { pattern: /^create\s+sequence\b/i, reason: "CREATE SEQUENCE" },
  { pattern: /\badd\s+column\b/i, reason: "ADD COLUMN" },
  { pattern: /\badd\s+constraint\b/i, reason: "ADD CONSTRAINT" },
];

const BACKFILL: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /^insert\s+into\b/i, reason: "INSERT" },
  { pattern: /^update\b/i, reason: "UPDATE" },
];

/** Split Drizzle output on its statement separator and drop SQL comments. */
export function splitMigrationStatements(sql: string): string[] {
  return sql
    .split("--> statement-breakpoint")
    .map((part) =>
      part
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter(Boolean)
    .map((statement) => statement.replace(/;+\s*$/, ""));
}

export function classifyStatement(sql: string): { class: MigrationClass; reason: string } {
  for (const rule of DESTRUCTIVE) {
    if (rule.pattern.test(sql)) return { class: "destructive", reason: rule.reason };
  }
  for (const rule of EXPAND) {
    if (rule.pattern.test(sql)) return { class: "expand", reason: rule.reason };
  }
  for (const rule of BACKFILL) {
    if (rule.pattern.test(sql)) return { class: "backfill", reason: rule.reason };
  }
  return { class: "unknown", reason: "unclassified statement" };
}

export function classifyMigration(file: string, sql: string): ClassifiedStatement[] {
  return splitMigrationStatements(sql).map((statement, index) => ({
    file,
    index,
    sql: statement,
    ...classifyStatement(statement),
  }));
}

export function classifyMigrations(
  files: ReadonlyArray<{ file: string; sql: string }>,
): MigrationReport {
  const statements = files.flatMap(({ file, sql }) => classifyMigration(file, sql));
  const destructive = statements.filter((statement) => statement.class === "destructive").length;
  return { statements, destructive, promotable: destructive === 0 };
}
