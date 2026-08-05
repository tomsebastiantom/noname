import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AIPipeline } from "../../../ai-pipeline/ports";
import type { ContentDocumentService } from "../../../documents/ports";
import type { ArtifactCollector } from "../artifacts";
import { extractContentData } from "../artifacts";
import type { AgentRunContext, TokenAccumulator } from "../context";
import { writeAuditFromRunContext } from "../context";

export function createGenerateContentDraftTool(
  deps: {
    aiPipeline: Pick<AIPipeline, "generateContent">;
    content: Pick<ContentDocumentService, "create">;
    artifacts: ArtifactCollector;
    tokens: TokenAccumulator;
    runContext: AgentRunContext | null;
  },
  orgId: string,
) {
  return createTool({
    id: "generateContentDraft",
    description:
      "Generate a CMS content entry draft from a prompt (requires human review before publish)",
    inputSchema: z.object({
      prompt: z.string().trim().min(1).max(4000),
      contentType: z.string().trim().min(1).max(64),
    }),
    execute: async ({ prompt, contentType }) => {
      const generated = await deps.aiPipeline.generateContent(orgId, contentType, prompt);
      deps.tokens.add(generated.tokens);
      const data = extractContentData(generated.response);
      const audit = deps.runContext ? writeAuditFromRunContext(deps.runContext) : undefined;
      const entry = await deps.content.create(orgId, contentType, data, { audit });

      deps.artifacts.push({
        kind: "content",
        documentId: entry.id,
        label: contentType,
      });

      return {
        contentId: entry.id,
        contentType: entry.type,
        status: entry.status,
      };
    },
  });
}
