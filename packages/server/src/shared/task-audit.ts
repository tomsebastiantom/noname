import type { WriteAudit } from "@noname/auth";
import type { TaskAuditRecord } from "../domains/agent/ports";

export function taskAuditRecord(audit: WriteAudit, at: Date = new Date()): TaskAuditRecord {
  return {
    actorType: audit.actorType,
    actorId: audit.actorId,
    onBehalfOf: audit.onBehalfOf ?? null,
    at,
  };
}
