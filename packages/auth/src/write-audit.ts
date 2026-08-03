import type { AuthActor, ActorType } from "./actors";

/** Attribution recorded on document writes and agent lifecycle events. */
export type WriteAudit = {
  actorType: ActorType;
  actorId: string;
  onBehalfOf?: string;
  taskId?: string;
};

export function writeAuditFromActor(actor: AuthActor, taskId?: string): WriteAudit {
  if (actor.type === "agent") {
    return {
      actorType: "agent",
      actorId: actor.agentId,
      onBehalfOf: actor.onBehalfOf,
      taskId,
    };
  }
  return {
    actorType: "human",
    actorId: actor.userId,
    taskId,
  };
}

export function withWriteAudit<T extends Record<string, unknown>>(
  data: T,
  audit: WriteAudit,
): T & WriteAudit {
  return { ...data, ...audit };
}
