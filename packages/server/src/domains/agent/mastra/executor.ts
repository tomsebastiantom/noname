import type { ToolsInput } from "@mastra/core/agent";
import { Agent } from "@mastra/core/agent";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { AIPipeline } from "../../ai-pipeline/ports";
import { orchestrateSystemPrompt } from "../../ai-pipeline/prompts/orchestrate-system";
import type { AnalyticsService } from "../../analytics/ports";
import type { AuthorizationPort } from "../../auth/authorization-port";
import type {
  ContentDocumentService,
  DocumentStorage,
  LayoutDocumentService,
} from "../../documents/ports";
import type { IntegrationsService } from "../../integrations/ports";
import type { LayoutCollabRoomManager } from "../../collab/layout-room";
import type { MachineEngine } from "../../machines/ports";
import type { SecretsService } from "../../secrets/ports";
import { createAgentCollabRuntime } from "../collab/agent-collab-runtime";
import { layoutCollabSessionOptions } from "../collab/layout-collab-session-options";
import type { AgentExecuteOptions, AgentExecutor, AgentToolResult } from "../tools";
import { createArtifactCollector } from "./artifacts";
import { createTokenAccumulator, parseAgentRunContext, type AgentRunContext } from "./context";
import { mapMastraSteps, stoppedReasonFromFinish } from "./format-steps";
import { resolveActiveTools } from "./guards";
import { runMockOrchestrate, shouldUseMockOrchestrate } from "./mock-orchestrate";
import { assertOrchestrateOutput, parseOrchestrateOutput } from "./orchestrate-output";
import { buildOrchestrateUserPrompt, parseConversationHistory } from "./orchestrate-prompt";
import { resolvePlannerModel } from "./resolve-planner-model";
import { createGenerateContentDraftTool } from "./tools/generate-content-draft";
import { createGenerateLayoutDraftTool } from "./tools/generate-layout-draft";
import { createGenerateMachineDraftTool } from "./tools/generate-machine-draft";
import { createListFolderDocumentsTool } from "./tools/list-folder-documents";
import { createNangoTriggerTool } from "./tools/nango-trigger";
import { createPatchLayoutDraftTool } from "./tools/patch-layout-draft";
import { createReadAnalyticsTool } from "./tools/read-analytics";
import { createReadDocumentTool } from "./tools/read-document";
import { createUpdateDraftFieldTool } from "./tools/update-draft-field";
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

function agentCollabDisplayName(runContext: AgentRunContext): string {
  const label = runContext.agentLabel?.trim();
  if (label) return label;
  if (runContext.agentSlug) return `Agent: ${runContext.agentSlug}`;
  return "Agent";
}

function pushAgentTaskActivity(
  rooms: MastraExecutorDeps["layoutCollabRooms"],
  runContext: AgentRunContext,
  phase: "started" | "ended",
): void {
  if (!runContext.targetLayoutDocumentId) return;
  rooms.broadcastAgentTask(runContext.orgId, runContext.targetLayoutDocumentId, {
    type: "agent-task",
    phase,
    taskId: runContext.taskId,
    registeredAgentId: runContext.registeredAgentId,
    displayName: agentCollabDisplayName(runContext),
  });
}

export interface MastraExecutorDeps {
  secrets: Pick<SecretsService, "resolveLlmApiKey">;
  authorization: AuthorizationPort;
  documents: Pick<
    DocumentStorage,
    | "findDocumentById"
    | "findCollectionIdBySlug"
    | "findCollectionSlug"
    | "listDocuments"
    | "recordDocumentOp"
  >;
  analytics: Pick<AnalyticsService, "query" | "aggregate">;
  integrations: Pick<IntegrationsService, "triggerOAuthAction">;
  aiPipeline: Pick<AIPipeline, "generateLayout" | "generateContent" | "generateMachine">;
  layout: Pick<LayoutDocumentService, "create" | "update" | "get">;
  content: Pick<ContentDocumentService, "create" | "updateById">;
  machines: Pick<MachineEngine, "define">;
  layoutCollabRooms: Pick<
    LayoutCollabRoomManager,
    "getSpec" | "applySpec" | "flushPersist" | "broadcastAgentTask"
  >;
}

export function createMastraExecutor(deps: MastraExecutorDeps): AgentExecutor {
  return {
    async execute(orgId, type, prompt, input, options?: AgentExecuteOptions) {
      if (type !== "orchestrate") {
        throw new Error(`Mastra executor only handles orchestrate tasks, got ${type}`);
      }
      if (!orchestrateEnabled()) {
        throw new Error("Orchestrate agent tasks are disabled (AGENT_ORCHESTRATE_ENABLED=false)");
      }

      const taskId = String(input.taskId ?? "unknown");
      const maxSteps = Number(input.maxSteps ?? process.env.AGENT_MAX_STEPS ?? "10");
      const modelSpec = process.env.MASTRA_PLANNER_MODEL?.trim() || "openai/gpt-4o-mini";
      const { model, credentialSource } = await resolvePlannerModel(orgId, deps.secrets, modelSpec);
      const runContext = parseAgentRunContext(orgId, input);
      const artifacts = createArtifactCollector();
      const pipelineTokens = createTokenAccumulator();
      const collabRuntime = createAgentCollabRuntime();

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
        readDocument: createReadDocumentTool(
          { storage: deps.documents, authorization: deps.authorization, runContext },
          orgId,
        ),
        listFolderDocuments: createListFolderDocumentsTool(
          { storage: deps.documents, authorization: deps.authorization, runContext },
          orgId,
        ),
        nango_trigger: createNangoTriggerTool(deps.integrations, orgId),
        generateLayoutDraft: createGenerateLayoutDraftTool(
          { aiPipeline: deps.aiPipeline, layout: deps.layout, ...sharedToolDeps },
          orgId,
        ),
        generateContentDraft: createGenerateContentDraftTool(
          { aiPipeline: deps.aiPipeline, content: deps.content, ...sharedToolDeps },
          orgId,
        ),
        generateMachineDraft: createGenerateMachineDraftTool(
          {
            aiPipeline: deps.aiPipeline,
            machines: deps.machines,
            artifacts,
            tokens: pipelineTokens,
          },
          orgId,
        ),
        updateDraftField: createUpdateDraftFieldTool(
          {
            storage: deps.documents,
            content: deps.content,
            authorization: deps.authorization,
            artifacts,
            runContext,
            collabRuntime,
          },
          orgId,
        ),
        patchLayoutDraft: createPatchLayoutDraftTool(
          {
            storage: deps.documents,
            layout: deps.layout,
            authorization: deps.authorization,
            artifacts,
            runContext,
            layoutCollabRooms: deps.layoutCollabRooms,
            collabRuntime,
          },
          orgId,
        ),
      } satisfies ToolsInput;

      const activeTools = resolveActiveTools(allowedTools).filter((name) => name in tools);

      if (shouldUseMockOrchestrate()) {
        const mockResult = await runMockOrchestrate(
          deps,
          orgId,
          prompt,
          input,
          activeTools,
          options?.onProgress,
        );
        const mockOutput = parseOrchestrateOutput(mockResult.output);
        if (mockOutput) recordStepSpans(taskId, mockOutput.steps);
        return mockResult;
      }

      try {
        const pageContextRaw = input.pageContext;
        const pageContext =
          pageContextRaw && typeof pageContextRaw === "object" && !Array.isArray(pageContextRaw)
            ? {
                templateName:
                  typeof (pageContextRaw as Record<string, unknown>).templateName === "string"
                    ? ((pageContextRaw as Record<string, unknown>).templateName as string)
                    : undefined,
                componentType:
                  typeof (pageContextRaw as Record<string, unknown>).componentType === "string"
                    ? ((pageContextRaw as Record<string, unknown>).componentType as string)
                    : null,
                fieldLabel:
                  typeof (pageContextRaw as Record<string, unknown>).fieldLabel === "string"
                    ? ((pageContextRaw as Record<string, unknown>).fieldLabel as string)
                    : null,
              }
            : undefined;

        let layoutSpecJson: string | undefined;
        if (runContext?.targetLayoutDocumentId) {
          const layoutDoc = await deps.documents.findDocumentById(
            runContext.targetLayoutDocumentId,
          );
          if (
            layoutDoc &&
            layoutDoc.orgId === orgId &&
            layoutDoc.type === "layout" &&
            layoutDoc.data.spec &&
            typeof layoutDoc.data.spec === "object"
          ) {
            layoutSpecJson = JSON.stringify(layoutDoc.data.spec);
          }
        }

        let effectiveActiveTools = activeTools;
        if (layoutSpecJson) {
          // Spec is in the system prompt — skip discovery tools so the planner patches immediately.
          effectiveActiveTools = activeTools.filter(
            (name) => name !== "readDocument" && name !== "listFolderDocuments",
          );
        }

        const instructions = orchestrateSystemPrompt({
          orgId,
          taskId,
          agentSlug: runContext?.agentSlug,
          targetLayoutDocumentId: runContext?.targetLayoutDocumentId,
          layoutSpecJson,
          pageContext,
        });

        const conversationHistory = parseConversationHistory(input);
        const userPrompt = buildOrchestrateUserPrompt(prompt, conversationHistory);

        if (runContext?.targetLayoutDocumentId) {
          await collabRuntime.ensureLayoutSession(
            layoutCollabSessionOptions(runContext, runContext.targetLayoutDocumentId),
          );
          pushAgentTaskActivity(deps.layoutCollabRooms, runContext, "started");
        }

        const agent = new Agent({
          id: "noname-orchestrator",
          name: "Noname Orchestrator",
          instructions,
          model,
          tools,
        });

        await options?.onProgress?.(
          assertOrchestrateOutput({
            summary: `Planning with ${modelSpec}…`,
            steps: [],
            artifacts: [],
            stoppedReason: "completed",
          }) as unknown as Record<string, unknown>,
        );

        const result = await agent.generate(userPrompt, {
          maxSteps,
          activeTools: effectiveActiveTools,
        });

        const steps = mapMastraSteps(result.steps ?? []);
        recordStepSpans(taskId, steps);
        trace.getActiveSpan()?.setAttribute("agent.planner_credential_source", credentialSource);

        const stoppedReason = stoppedReasonFromFinish(result.finishReason);
        const patchedLayout = steps.some(
          (step) => step.tool === "patchLayoutDraft" && step.status === "ok",
        );
        let summary = result.text?.trim();
        if (!summary) {
          if (stoppedReason === "max_steps") {
            summary =
              "Reached the step limit before applying the edit. Clear chat and try again — the layout spec is already loaded.";
          } else if (!patchedLayout && prompt.toLowerCase().includes("sale")) {
            summary =
              "Could not apply the layout change this run. Clear chat and send the edit again.";
          } else {
            summary = "Run completed";
          }
        }

        const output: OrchestrateOutput = assertOrchestrateOutput({
          summary,
          steps,
          artifacts: artifacts.list(),
          stoppedReason,
        });

        const plannerTokens = result.totalUsage?.totalTokens ?? result.usage?.totalTokens ?? 0;
        const tokens = plannerTokens + pipelineTokens.total();

        return {
          output: output as unknown as Record<string, unknown>,
          model: modelSpec,
          tokens,
        } satisfies AgentToolResult;
      } finally {
        if (runContext?.targetLayoutDocumentId) {
          pushAgentTaskActivity(deps.layoutCollabRooms, runContext, "ended");
        }
        try {
          await collabRuntime.close();
        } catch (err) {
          console.error("[agent-mastra] collab runtime close failed", err);
        }
      }
    },
  };
}
