import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AIPipeline } from "../../../ai-pipeline/ports";
import type { LayoutDocumentService } from "../../../documents/ports";
import type { ArtifactCollector } from "../artifacts";
import { extractLayoutSpec } from "../artifacts";
import type { AgentRunContext, TokenAccumulator } from "../context";
import { writeAuditFromRunContext } from "../context";

export function createGenerateLayoutDraftTool(
  deps: {
    aiPipeline: Pick<AIPipeline, "generateLayout">;
    layout: Pick<LayoutDocumentService, "create">;
    artifacts: ArtifactCollector;
    tokens: TokenAccumulator;
    runContext: AgentRunContext | null;
  },
  orgId: string,
) {
  return createTool({
    id: "generateLayoutDraft",
    description:
      "Generate a json-render layout draft from a prompt (requires human review before publish)",
    inputSchema: z.object({
      prompt: z.string().trim().min(1).max(4000),
      templateName: z
        .string()
        .trim()
        .min(1)
        .max(64)
        .regex(/^[a-z0-9-]+$/),
      context: z.record(z.string(), z.unknown()).optional(),
    }),
    execute: async ({ prompt, templateName, context }) => {
      const generated = await deps.aiPipeline.generateLayout(orgId, prompt, context ?? {});
      deps.tokens.add(generated.tokens);
      const spec = extractLayoutSpec(generated.response);
      const audit = deps.runContext ? writeAuditFromRunContext(deps.runContext) : undefined;
      const layout = await deps.layout.create(orgId, {
        templateName,
        spec,
        audit,
      });

      deps.artifacts.push({
        kind: "layout",
        documentId: layout.id,
        label: templateName,
      });

      return {
        layoutId: layout.id,
        templateName: layout.key,
        status: layout.status,
      };
    },
  });
}
