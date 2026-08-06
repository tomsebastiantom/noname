import type { WriteAudit } from "@noname/auth";

export interface AgentRunContext {
  orgId: string;
  taskId: string;
  registeredAgentId: string;
  agentSlug: string;
  agentLabel?: string;
  onBehalfOf: string;
  targetLayoutDocumentId?: string;
  targetContentDocumentId?: string;
  targetFieldKey?: string;
  targetLocale?: string;
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
  const agentLabel = typeof input.agentLabel === "string" ? input.agentLabel.trim() : undefined;
  const onBehalfOf = typeof input.onBehalfOf === "string" ? input.onBehalfOf : "";
  const targetLayoutDocumentId =
    typeof input.targetLayoutDocumentId === "string" ? input.targetLayoutDocumentId : undefined;
  const targetContentDocumentId =
    typeof input.targetContentDocumentId === "string" ? input.targetContentDocumentId : undefined;
  const targetFieldKey =
    typeof input.targetFieldKey === "string" ? input.targetFieldKey : undefined;
  const targetLocale = typeof input.targetLocale === "string" ? input.targetLocale : undefined;

  if (!taskId || !registeredAgentId) return null;

  return {
    orgId,
    taskId,
    registeredAgentId,
    agentSlug,
    ...(agentLabel ? { agentLabel } : {}),
    onBehalfOf,
    ...(targetLayoutDocumentId ? { targetLayoutDocumentId } : {}),
    ...(targetContentDocumentId ? { targetContentDocumentId } : {}),
    ...(targetFieldKey ? { targetFieldKey } : {}),
    ...(targetLocale ? { targetLocale } : {}),
  };
}
