import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { IntegrationsService } from "../../../integrations/ports";

export function createNangoTriggerTool(
  integrations: Pick<IntegrationsService, "triggerOAuthAction">,
  orgId: string,
) {
  return createTool({
    id: "nango_trigger",
    description: "Call a connected OAuth integration action via Nango",
    inputSchema: z.object({
      integrationId: z.string().trim().min(1).max(128),
      actionName: z.string().trim().min(1).max(128),
      input: z.record(z.string(), z.unknown()).optional(),
    }),
    execute: async ({ integrationId, actionName, input }) => {
      const result = await integrations.triggerOAuthAction(
        orgId,
        integrationId,
        actionName,
        input ?? {},
      );
      return { result };
    },
  });
}
