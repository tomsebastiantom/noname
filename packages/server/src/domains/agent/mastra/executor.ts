import { SpanStatusCode, trace } from "@opentelemetry/api";
import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";
import { orchestrateSystemPrompt } from "../../ai-pipeline/prompts/orchestrate-system";
import type { AIPipeline } from "../../ai-pipeline/ports";
import type { AnalyticsService } from "../../analytics/ports";
import type { ContentDocumentService, LayoutDocumentService } from "../../documents/ports";
import type { IntegrationsService } from "../../integrations/ports";
import type { AgentExecutor, AgentToolResult } from "../tools";
import { createArtifactCollector } from "./artifacts";
import {
  createTokenAccumulator,
  parseAgentRunContext,
} from "./context";
import { mapMastraSteps, stoppedReasonFromFinish } from "./format-steps";
import { resolveActiveTools } from "./guards";
import { assertOrchestrateOutput } from "./orchestrate-output";
import { createGenerateContentDraftTool } from "./tools/generate-content-draft";
import { createGenerateLayoutDraftTool } from "./tools/generate-layout-draft";
import { createNangoTriggerTool } from "./tools/nango-trigger";
import { createReadAnalyticsTool } from "./tools/read-analytics";
import type { OrchestrateOutput } from "./types";

function orchestrateEnabled(): boolean {
  const flag = process.env.AGENT_ORCHESTRATE_ENABLED?.trim().toLowerCase();
  return flag !== "false" && flag !== "0";
}

const tracer = trace.getTracer("agent-mastra");

function recordStepSpans(taskId: string, steps: OrchestrateOutput["steps"]): void {
  for (const step of steps) {
    const span = tracer.startSpan(`agent.tool.${step.tool}`);
    span.setAttribute("agent.task_id", taskId);
    span.setAttribute("agent.tool.name", step.tool);
    span.setAttribute("agent.tool.status", step.status);
    span.setAttribute("agent.tool.duration_ms", step.durationMs);
    if (step.status === "error") {
      span.setStatus({ code: SpanStatusCode.ERROR });
    }
    span.end();
  }
}

export interface MastraExecutorDeps {
  analytics: Pick<AnalyticsService, "query" | "aggregate">;
  integrations: Pick<IntegrationsService, "triggerOAuthAction">;
  aiPipeline: Pick<AIPipeline, "generateLayout" | "generateContent">;
  layout: Pick<LayoutDocumentService, "create">;
  content: Pick<ContentDocumentService, "create">;
}

export function createMastraExecutor(deps: MastraExecutorDeps): AgentExecutor {
  return {
    async execute(orgId, type, prompt, input) {
      if (type !== "orchestrate") {
        throw new Error(`Mastra executor only handles orchestrate tasks, got ${type}`);
      }
      if (!orchestrateEnabled()) {
        throw new Error("Orchestrate agent tasks are disabled (AGENT_ORCHESTRATE_ENABLED=false)");
      }

      const taskId = String(input.taskId ?? "unknown");
      const maxSteps = Number(input.maxSteps ?? process.env.AGENT_MAX_STEPS ?? "10");
      const model = process.env.MASTRA_PLANNER_MODEL?.trim() || "openai/gpt-4o-mini";
      const runContext = parseAgentRunContext(orgId, input);
      const artifacts = createArtifactCollector();
      const pipelineTokens = createTokenAccumulator();

      const allowedTools = Array.isArray(input.allowedTools)
        ? input.allowedTools.filter((value): value is string => typeof value === "string")
        : null;

      const sharedToolDeps = {
        artifacts,
        tokens: pipelineTokens,
        runContext,
      };

      const tools = {
        readAnalytics: createReadAnalyticsTool(deps.analytics, orgId),
        nango_trigger: createNangoTriggerTool(deps.integrations, orgId),
        generateLayoutDraft: createGenerateLayoutDraftTool(
          { aiPipeline: deps.aiPipeline, layout: deps.layout, ...sharedToolDeps },
          orgId,
        ),
        generateContentDraft: createGenerateContentDraftTool(
          { aiPipeline: deps.aiPipeline, content: deps.content, ...sharedToolDeps },
          orgId,
        ),
      } satisfies ToolsInput;

      const activeTools = resolveActiveTools(allowedTools).filter((name) => name in tools);

      const instructions = orchestrateSystemPrompt({
        orgId,
        taskId,
        agentSlug: runContext?.agentSlug,
      });

      const agent = new Agent({
        id: "noname-orchestrator",
        name: "Noname Orchestrator",
        instructions,
        model,
        tools,
      });

      const result = await agent.generate(prompt, {
        maxSteps,
        activeTools,
      });

      const steps = mapMastraSteps(result.steps ?? []);
      recordStepSpans(taskId, steps);

      const output: OrchestrateOutput = assertOrchestrateOutput({
        summary: result.text?.trim() || "Run completed",
        steps,
        artifacts: artifacts.list(),
        stoppedReason: stoppedReasonFromFinish(result.finishReason),
      });

      const plannerTokens = result.totalUsage?.totalTokens ?? result.usage?.totalTokens ?? 0;
      const tokens = plannerTokens + pipelineTokens.total();

      return {
        output: output as unknown as Record<string, unknown>,
        model,
        tokens,
      } satisfies AgentToolResult;
    },
  };
}
