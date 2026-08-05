import type { AnalyticsService } from "../../analytics/ports";
import type { AgentToolResult } from "../tools";
import { createArtifactCollector } from "./artifacts";
import { createTokenAccumulator, parseAgentRunContext, writeAuditFromRunContext } from "./context";
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
    const summary = typeof result === "string" ? result : JSON.stringify(result).slice(0, 160);
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

  if (activeTools.includes("readDocument")) {
    await runStep(steps, "readDocument", async () => {
      const storage = deps.documents;
      try {
        const doc = await storage.findDocumentById("mock-doc");
        if (!doc || doc.orgId !== orgId) {
          return { found: false, documentId: "mock-doc" };
        }
        return { found: true, documentId: doc.id, type: doc.type };
      } catch {
        return { found: false, documentId: "mock-doc", reason: "not a valid document id in mock" };
      }
    });
  }

  if (activeTools.includes("listFolderDocuments")) {
    await runStep(steps, "listFolderDocuments", async () => {
      const storage = deps.documents;
      const collectionId = await storage.findCollectionIdBySlug(orgId, "marketing");
      if (!collectionId) {
        return { found: false, folderSlug: "marketing", count: 0 };
      }
      const rows = await storage.listDocuments(orgId, { collectionId });
      return { found: true, folderSlug: "marketing", count: rows.length };
    });
  }

  if (activeTools.includes("generateLayoutDraft")) {
    const baseName = slugFromPrompt(prompt, "orchestrate-hero");
    const templateName = `${baseName}-${Date.now().toString(36)}`;
    await runStep(steps, "generateLayoutDraft", async () => {
      const layout = await deps.layout.create(orgId, {
        templateName,
        spec: {
          root: "root",
          elements: {
            root: { type: "Container", props: {}, children: [] },
          },
        },
        audit,
      });
      artifacts.push({ kind: "layout", documentId: layout.id, label: templateName });
      return { layoutId: layout.id, templateName: layout.key };
    });
  }

  if (activeTools.includes("generateContentDraft")) {
    await runStep(steps, "generateContentDraft", async () => ({
      skipped: true,
      reason: "mock orchestrate skips content draft (needs locale-aware CMS write)",
    }));
  }

  if (activeTools.includes("generateMachineDraft")) {
    await runStep(steps, "generateMachineDraft", async () => ({
      skipped: true,
      reason: "mock orchestrate skips machine draft",
    }));
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
