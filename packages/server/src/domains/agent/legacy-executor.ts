import type { AIPipeline } from "../ai-pipeline/ports";
import type { AnalyticsService } from "../analytics/ports";
import type { AgentExecutor, AgentToolResult } from "./tools";

function pipelineTaskResult(r: { response: unknown; model: string; tokens: number }): AgentToolResult {
  return {
    output: r.response as Record<string, unknown>,
    model: r.model,
    tokens: r.tokens,
  };
}

export interface LegacyAgentExecutorDeps {
  aiPipeline: Pick<AIPipeline, "generateLayout" | "generateContent" | "generateMachine">;
  analytics: Pick<AnalyticsService, "query" | "aggregate">;
}

export function createLegacyAgentExecutor(deps: LegacyAgentExecutorDeps): AgentExecutor {
  const { aiPipeline, analytics } = deps;

  return {
    async execute(orgId, type, prompt, input) {
      switch (type) {
        case "generate_layout":
          return pipelineTaskResult(await aiPipeline.generateLayout(orgId, prompt, input));
        case "generate_content":
          return pipelineTaskResult(await aiPipeline.generateContent(orgId, "content", prompt));
        case "generate_machine":
          return pipelineTaskResult(await aiPipeline.generateMachine(orgId, type, prompt));
        case "analyze_analytics": {
          const limit = typeof input.limit === "number" ? input.limit : 50;
          const [events, aggregates] = await Promise.all([
            analytics.query({ orgId, limit }),
            analytics.aggregate({ orgId, groupBy: "eventType", limit: 20 }),
          ]);
          return {
            output: {
              query: prompt,
              eventCount: events.length,
              events,
              aggregates,
            },
            model: "analytics",
            tokens: 0,
          };
        }
        default:
          return { output: {}, model: "mock", tokens: 0 };
      }
    },
  };
}
