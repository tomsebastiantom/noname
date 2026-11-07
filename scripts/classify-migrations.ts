import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { classifyMigrations } from "../packages/server/src/domains/release/migrations/classify";

/**
 * Classify generated migrations so a release cannot silently ship a destructive schema change.
 *
 *   pnpm migrations:classify                         # all drizzle migrations (report)
 *   pnpm migrations:classify <files...>              # selected files
 *   pnpm migrations:classify --block-destructive     # exit 1 if any DROP/RENAME/TRUNCATE/DELETE
 *   pnpm migrations:classify --json                  # machine-readable for the release gate
 */
const args = process.argv.slice(2);
const blockDestructive = args.includes("--block-destructive");
const asJson = args.includes("--json");
const explicit = args.filter((argument) => !argument.startsWith("--"));

const drizzleDir = "packages/server/drizzle";
const files =
  explicit.length > 0
    ? explicit
    : readdirSync(drizzleDir)
        .filter((file) => file.endsWith(".sql"))
        .sort()
        .map((file) => join(drizzleDir, file));

if (files.length === 0) {
  console.error("no migration files found");
  process.exit(2);
}

let report;
try {
  report = classifyMigrations(
    files.map((file) => ({ file: basename(file), sql: readFileSync(file, "utf8") })),
  );
} catch (error) {
  console.error(`could not read migrations: ${(error as Error).message}`);
  process.exit(2);
}

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const statement of report.statements) {
    const firstLine = statement.sql.split("\n")[0]?.slice(0, 90) ?? "";
    console.log(
      `${statement.file}#${statement.index}  ${statement.class.padEnd(11)}  ${statement.reason.padEnd(18)}  ${firstLine}`,
    );
  }
  console.log(
    `\n${report.statements.length} statement(s), ${report.destructive} destructive — ${
      report.promotable ? "PROMOTABLE" : "BLOCKED"
    }`,
  );
}

process.exit(blockDestructive && report.destructive > 0 ? 1 : 0);
