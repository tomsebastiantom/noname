import { describe, expect, it } from "vitest";
import { ALL_DOMAIN_EVENTS, DOMAIN_EVENT_SOURCES } from "./domain-events";

describe("ALL_DOMAIN_EVENTS", () => {
  it("is assembled from DOMAIN_EVENT_SOURCES (no manual duplicate list)", () => {
    const fromSources = DOMAIN_EVENT_SOURCES.flatMap((events) => Object.values(events));
    expect(ALL_DOMAIN_EVENTS).toEqual(fromSources);
  });

  it("has no duplicate names", () => {
    expect(new Set(ALL_DOMAIN_EVENTS).size).toBe(ALL_DOMAIN_EVENTS.length);
  });
});
