import { describe, expect, it } from "vitest";
import { SCHEDULE_DEFINITIONS } from "./definitions";

/**
 * The definitions file is the platform's list of scheduled work, so these are cheap guards against the mistakes that
 * are easy to make in it and hard to notice at runtime.
 */
describe("schedule definitions", () => {
  it("has unique names", () => {
    const names = SCHEDULE_DEFINITIONS.map((definition) => definition.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses names that read like identifiers, since they appear in URLs and audit rows", () => {
    for (const definition of SCHEDULE_DEFINITIONS) {
      expect(definition.name).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });

  it("describes what each job does", () => {
    for (const definition of SCHEDULE_DEFINITIONS) {
      expect(definition.description.trim().length).toBeGreaterThan(20);
    }
  });

  it("ships 5-field cron patterns, because BullMQ silently never fires on anything else", () => {
    for (const definition of SCHEDULE_DEFINITIONS) {
      expect(definition.defaultPattern.trim().split(/\s+/)).toHaveLength(5);
    }
  });

  it("starts every new schedule in dry-run", () => {
    for (const definition of SCHEDULE_DEFINITIONS) {
      expect(definition.dryRunDefault).toBe(true);
    }
  });
});
