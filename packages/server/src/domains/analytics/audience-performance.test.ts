import { describe, expect, it } from "vitest";
import type { AudiencePerformanceSource } from "./audience-performance";
import { suppressSmallAudiencePerformance } from "./audience-performance";

const base: AudiencePerformanceSource = {
  audienceKey: "recent_buyer",
  from: new Date("2026-09-01T00:00:00.000Z"),
  to: new Date("2026-09-27T00:00:00.000Z"),
  bindings: [],
};

describe("audience performance small-sample suppression", () => {
  it("withholds all counts when repeated visits come from fewer than ten accounts", () => {
    const report = suppressSmallAudiencePerformance({
      ...base,
      bindings: [
        {
          audienceDefinitionVersion: 1,
          bindingId: "binding-1",
          bindingVersion: 1,
          servedDecisionCount: 100,
          renderedDecisionCount: 100,
          exposedAccountCount: 1,
          outcomeAccountCount: 1,
        },
      ],
    });

    expect(report.minimumSampleSize).toBe(10);
    expect(report.rateDenominator).toBe("exposedAccountCount");
    expect(report.bindings[0]).toEqual({
      audienceDefinitionVersion: 1,
      bindingId: "binding-1",
      bindingVersion: 1,
      sampleStatus: "insufficient_exposed_accounts",
      servedDecisionCount: null,
      renderedDecisionCount: null,
      exposedAccountCount: null,
      outcomeAccountCount: null,
      outcomeRate: null,
    });
  });

  it("shows exposure aggregates but withholds fewer than ten distinct outcome accounts", () => {
    const report = suppressSmallAudiencePerformance({
      ...base,
      bindings: [
        {
          audienceDefinitionVersion: 2,
          bindingId: "binding-2",
          bindingVersion: 3,
          servedDecisionCount: 120,
          renderedDecisionCount: 100,
          exposedAccountCount: 85,
          outcomeAccountCount: 9,
        },
      ],
    });

    expect(report.bindings[0]).toEqual({
      audienceDefinitionVersion: 2,
      bindingId: "binding-2",
      bindingVersion: 3,
      sampleStatus: "outcomes_suppressed",
      servedDecisionCount: 120,
      renderedDecisionCount: 100,
      exposedAccountCount: 85,
      outcomeAccountCount: null,
      outcomeRate: null,
    });
  });

  it("reports counts and account rate once both groups meet ten", () => {
    const report = suppressSmallAudiencePerformance({
      ...base,
      bindings: [
        {
          audienceDefinitionVersion: 2,
          bindingId: "binding-2",
          bindingVersion: 3,
          servedDecisionCount: 120,
          renderedDecisionCount: 100,
          exposedAccountCount: 85,
          outcomeAccountCount: 10,
        },
      ],
    });

    expect(report.bindings[0]).toEqual({
      audienceDefinitionVersion: 2,
      bindingId: "binding-2",
      bindingVersion: 3,
      sampleStatus: "available",
      servedDecisionCount: 120,
      renderedDecisionCount: 100,
      exposedAccountCount: 85,
      outcomeAccountCount: 10,
      outcomeRate: 10 / 85,
    });
  });

  it("rejects impossible raw aggregate counts", () => {
    expect(() =>
      suppressSmallAudiencePerformance({
        ...base,
        bindings: [
          {
            audienceDefinitionVersion: null,
            bindingId: "binding-3",
            bindingVersion: 1,
            servedDecisionCount: 2,
            renderedDecisionCount: 5,
            exposedAccountCount: 5,
            outcomeAccountCount: 0,
          },
        ],
      }),
    ).toThrow("Invalid aggregate audience performance counts");
  });
});
