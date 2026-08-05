import type { AIPipeline } from "../../ai-pipeline/ports";
import type { AnalyticsService } from "../../analytics/ports";
import type { ContentDocumentService, LayoutDocumentService } from "../../documents/ports";
import type { MachineEngine } from "../../machines/ports";
import type { AgentToolResult } from "../tools";
import { createArtifactCollector } from "./artifacts";
import { extractContentData, extractLayoutSpec, extractMachineDefinition } from "./artifacts";
import {
  createTokenAccumulator,
  parseAgentRunContext,
  writeAuditFromRunContext,
} from "./context";
import type { MastraExecutorDeps } from "./executor";
import { assertOrchestrateOutput } from "./orchestrate-output";
import type { AgentStepRecord } from "./types";

function mockOrchestrateEnabled(): boolean {
  const flag = process.env.MASTRA_ORCHESTRATE_MOCK?.trim().toLowerCase();
  return flag === "true" || flag === "1";
}

function slugFromPrompt(prompt: string, fallback: string): string {
  const named = prompt.match(/\b(?:named|called)\s+([a-z0-9-]+)/i);
  if (named?.[1]) return named[1].toLowerCase();
  const words = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3);
  if (words.length > 0) return words.join("-").slice(0, 48);
  return fallback;
}

async function runStep(
  steps: AgentStepRecord[],
  tool: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  try {
    const result = await fn();
    const summary =
      typeof result === "string" ? result : JSON.stringify(result).slice(0, 160);
    steps.push({
      index: steps.length,
      tool,
      status: "ok",
      startedAt,
      durationMs: Date.now() - t0,
      outputSummary: summary,
    });
  } catch (err) {
    steps.push({
      index: steps.length,
      tool,
      status: "error",
      startedAt,
      durationMs: Date.now() - t0,
      outputSummary: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export function shouldUseMockOrchestrate(): boolean {
  return mockOrchestrateEnabled();
}

export async function runMockOrchestrate(
  deps: MastraExecutorDeps,
  orgId: string,
  prompt: string,
  input: Record<string, unknown>,
  activeTools: string[],
): Promise<AgentToolResult> {
  const taskId = String(input.taskId ?? "unknown");
  const runContext = parseAgentRunContext(orgId, input);
  const audit = runContext ? writeAuditFromRunContext(runContext) : undefined;
  const artifacts = createArtifactCollector();
  const pipelineTokens = createTokenAccumulator();
  const steps: AgentStepRecord[] = [];

  if (activeTools.includes("readAnalytics")) {
    await runStep(steps, "readAnalytics", async () => {
      const analytics = deps.analytics as Pick<AnalyticsService, "query" | "aggregate">;
      const [events, aggregates] = await Promise.all([
        analytics.query({ orgId, limit: 25 }),
        analytics.aggregate({ orgId, groupBy: "eventType", limit: 20 }),
      ]);
      return { eventCount: events.length, aggregates };
    });
  }

  if (activeTools.includes("generateLayoutDraft")) {
    const templateName = slugFromPrompt(prompt, "orchestrate-hero");
    await runStep(steps, "generateLayoutDraft", async () => {
      const aiPipeline = deps.aiPipeline as Pick<AIPipeline, "generateLayout">;
      const generated = await aiPipeline.generateLayout(orgId, prompt, {});
      pipelineTokens.add(generated.tokens);
      const layout = await deps.layout.create(orgId, {
        templateName,
        spec: extractLayoutSpec(generated.response),
        audit,
      });
      artifacts.push({ kind: "layout", documentId: layout.id, label: templateName });
      return { layoutId: layout.id, templateName: layout.key };
    });
  }

  if (activeTools.includes("generateContentDraft")) {
    const contentType = prompt.toLowerCase().includes("blog") ? "blog_post" : "page";
    await runStep(steps, "generateContentDraft", async () => {
      const aiPipeline = deps.aiPipeline as Pick<AIPipeline, "generateContent">;
      const generated = await aiPipeline.generateContent(orgId, contentType, prompt);
      pipelineTokens.add(generated.tokens);
      const entry = await deps.content.create(orgId, contentType, extractContentData(generated.response), {
        audit,
      });
      artifacts.push({ kind: "content", documentId: entry.id, label: contentType });
      return { contentId: entry.id, contentType: entry.type };
    });
  }

  if (activeTools.includes("generateMachineDraft")) {
    const machineName = slugFromPrompt(prompt, "orchestrate-flow");
    await runStep(steps, "generateMachineDraft", async () => {
      const aiPipeline = deps.aiPipeline as Pick<AIPipeline, "generateMachine">;
      const generated = await aiPipeline.generateMachine(orgId, machineName, prompt);
      pipelineTokens.add(generated.tokens);
      const definition = extractMachineDefinition(generated.response, machineName);
      const saved = await deps.machines.define(orgId, { ...definition, name: machineName });
      artifacts.push({ kind: "machine", documentId: saved.name, label: saved.name });
      return { machineName: saved.name };
    });
  }

  if (activeTools.includes("nango_trigger")) {
    await runStep(steps, "nango_trigger", async () => ({
      skipped: true,
      reason: "mock orchestrate does not call live OAuth integrations",
    }));
  }

  const output = assertOrchestrateOutput({
    summary: `Mock orchestrate finished (${steps.length} steps). ${prompt.slice(0, 120)}`,
    steps,
    artifacts: artifacts.list(),
    stoppedReason: "completed",
  });

  return {
    output: output as unknown as Record<string, unknown>,
    model: "mock-orchestrate",
    tokens: pipelineTokens.total(),
  };
}
