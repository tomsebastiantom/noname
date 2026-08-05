export type ToolGuard = "auto" | "human_approval" | "denied";

export const TOOL_GUARDS: Record<string, ToolGuard> = {
  readAnalytics: "auto",
  nango_trigger: "auto",
  generateLayoutDraft: "human_approval",
  generateContentDraft: "human_approval",
  generateMachineDraft: "human_approval",
  publish: "denied",
};

export const ORCHESTRATE_TOOL_IDS = [
  "readAnalytics",
  "nango_trigger",
  "generateLayoutDraft",
  "generateContentDraft",
  "generateMachineDraft",
] as const;

export type OrchestrateToolId = (typeof ORCHESTRATE_TOOL_IDS)[number];

export function isRegisteredOrchestrateTool(name: string): name is OrchestrateToolId {
  return ORCHESTRATE_TOOL_IDS.includes(name as OrchestrateToolId);
}

export function isToolDenied(name: string): boolean {
  return TOOL_GUARDS[name] === "denied";
}

/** Effective Mastra tools for an orchestrate run (never includes denied tools). */
export function resolveActiveTools(allowedTools: string[] | null): OrchestrateToolId[] {
  const requested = allowedTools?.length ? allowedTools : [...ORCHESTRATE_TOOL_IDS];
  return requested.filter(
    (name): name is OrchestrateToolId =>
      isRegisteredOrchestrateTool(name) && !isToolDenied(name),
  );
}
