import type { AudienceExperiencePerformanceBinding } from "../audiences/ports";
import type { AudiencePerformanceReport } from "./ports";

/** Minimum number of distinct exposed accounts before any experience metric is disclosed. */
export const MIN_AUDIENCE_SAMPLE_SIZE = 10;

export interface AudiencePerformanceSource {
  audienceKey: string;
  from: Date;
  to: Date;
  bindings: AudienceExperiencePerformanceBinding[];
}

/** Suppress low-account samples before the aggregate report leaves the server boundary. */
export function suppressSmallAudiencePerformance(
  result: AudiencePerformanceSource,
): AudiencePerformanceReport {
  return {
    audienceKey: result.audienceKey,
    from: result.from.toISOString(),
    to: result.to.toISOString(),
    rateLabel: "observational_not_causal",
    rateDenominator: "exposedAccountCount",
    minimumSampleSize: MIN_AUDIENCE_SAMPLE_SIZE,
    bindings: result.bindings.map((binding) => {
      const counts = [
        binding.servedDecisionCount,
        binding.renderedDecisionCount,
        binding.exposedAccountCount,
        binding.outcomeAccountCount,
      ];
      if (
        !counts.every((count) => Number.isSafeInteger(count) && count >= 0) ||
        binding.renderedDecisionCount > binding.servedDecisionCount ||
        binding.exposedAccountCount > binding.renderedDecisionCount ||
        binding.outcomeAccountCount > binding.exposedAccountCount
      ) {
        throw new Error("Invalid aggregate audience performance counts");
      }

      const common = {
        audienceDefinitionVersion: binding.audienceDefinitionVersion,
        bindingId: binding.bindingId,
        bindingVersion: binding.bindingVersion,
      };
      if (binding.exposedAccountCount < MIN_AUDIENCE_SAMPLE_SIZE) {
        return {
          ...common,
          sampleStatus: "insufficient_exposed_accounts" as const,
          servedDecisionCount: null,
          renderedDecisionCount: null,
          exposedAccountCount: null,
          outcomeAccountCount: null,
          outcomeRate: null,
        };
      }
      if (binding.outcomeAccountCount < MIN_AUDIENCE_SAMPLE_SIZE) {
        return {
          ...common,
          sampleStatus: "outcomes_suppressed" as const,
          servedDecisionCount: binding.servedDecisionCount,
          renderedDecisionCount: binding.renderedDecisionCount,
          exposedAccountCount: binding.exposedAccountCount,
          outcomeAccountCount: null,
          outcomeRate: null,
        };
      }
      return {
        ...common,
        sampleStatus: "available" as const,
        servedDecisionCount: binding.servedDecisionCount,
        renderedDecisionCount: binding.renderedDecisionCount,
        exposedAccountCount: binding.exposedAccountCount,
        outcomeAccountCount: binding.outcomeAccountCount,
        outcomeRate: binding.outcomeAccountCount / binding.exposedAccountCount,
      };
    }),
  };
}
