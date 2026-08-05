import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AnalyticsService } from "../../../analytics/ports";

export function createReadAnalyticsTool(
  analytics: Pick<AnalyticsService, "query" | "aggregate">,
  orgId: string,
) {
  return createTool({
    id: "readAnalytics",
    description: "Query recent analytics events and aggregates for the current organization",
    inputSchema: z.object({
      query: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ limit }) => {
      const resolvedLimit = limit ?? 25;
      const [events, aggregates] = await Promise.all([
        analytics.query({ orgId, limit: resolvedLimit }),
        analytics.aggregate({ orgId, groupBy: "eventType", limit: 20 }),
      ]);
      return {
        eventCount: events.length,
        events,
        aggregates,
      };
    },
  });
}
