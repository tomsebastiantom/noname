import type { WriteAudit } from "@noname/auth";

export interface AgentRunContext {
  orgId: string;
  taskId: string;
  registeredAgentId: string;
  agentSlug: string;
  onBehalfOf: string;
}

export interface TokenAccumulator {
  add(tokens: number): void;
  total(): number;
}

export function createTokenAccumulator(initial = 0): TokenAccumulator {
  let total = initial;
  return {
    add(tokens) {
      if (Number.isFinite(tokens) && tokens > 0) total += tokens;
    },
    total() {
      return total;
    },
  };
}

export function writeAuditFromRunContext(ctx: AgentRunContext): WriteAudit {
  return {
    actorType: "agent",
    actorId: ctx.registeredAgentId,
    onBehalfOf: ctx.onBehalfOf,
    taskId: ctx.taskId,
  };
}

export function parseAgentRunContext(
  orgId: string,
  input: Record<string, unknown>,
): AgentRunContext | null {
  const taskId = typeof input.taskId === "string" ? input.taskId : null;
  const registeredAgentId =
    typeof input.registeredAgentId === "string" ? input.registeredAgentId : null;
  const agentSlug = typeof input.agentSlug === "string" ? input.agentSlug : "";
  const onBehalfOf = typeof input.onBehalfOf === "string" ? input.onBehalfOf : "";

  if (!taskId || !registeredAgentId) return null;

  return {
    orgId,
    taskId,
    registeredAgentId,
    agentSlug,
    onBehalfOf,
  };
}
