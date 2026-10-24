import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEEDED_MACHINE_FILES } from "./index";

/**
 * The seeder is the *only* writer of `machine_definitions`, and the stored row is what the engine
 * actually loads. A definition file that exists but is not seeded is therefore invisible to the running
 * system, no matter what the code expects.
 *
 * That is not hypothetical: `inventory.json` sat in the repository while `inventory_reservation` existed
 * in the database only because somebody had inserted it by hand. Locally everything worked; a fresh
 * environment would have had no inventory machine at all, and `commerce.inventory.reserve` would fail
 * there while passing on the machine where it was hand-patched.
 *
 * These assertions turn "did we remember to seed it?" into a test failure at the moment a file is added.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const MACHINES_DIR = join(ROOT, "packages/extensions/src/commerce/machines");

describe("seeded machine definitions", () => {
  it("seeds every machine definition file on disk", () => {
    const onDisk = readdirSync(MACHINES_DIR)
      .filter((file) => file.endsWith(".json"))
      .sort();
    const seeded = [...SEEDED_MACHINE_FILES].sort();

    // A file that is not seeded will never reach the database; fail loudly rather than silently omitting
    // a machine the capabilities call.
    expect(seeded).toEqual(onDisk);
  });

  it("names a file that actually exists, for every entry", () => {
    const onDisk = new Set(readdirSync(MACHINES_DIR));
    for (const file of SEEDED_MACHINE_FILES) {
      expect(onDisk.has(file)).toBe(true);
    }
  });
});
