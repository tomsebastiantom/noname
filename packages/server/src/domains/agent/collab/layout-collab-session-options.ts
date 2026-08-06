import type { AgentRunContext } from "../mastra/context";
import type { AgentLayoutCollabSessionOptions } from "./agent-layout-collab-session";

export function agentCollabServerPort(): number {
  return Number(process.env.PORT) || 3000;
}

/** WS presence peer for the open layout — spec writes use the server collab room handle. */
export function layoutCollabSessionOptions(
  runContext: AgentRunContext,
  layoutDocumentId: string,
): AgentLayoutCollabSessionOptions {
  return {
    orgId: runContext.orgId,
    layoutDocumentId,
    userId: runContext.registeredAgentId,
    agentSlug: runContext.agentSlug,
    agentLabel: runContext.agentLabel,
    port: agentCollabServerPort(),
  };
}
