import { writeAuditFromActor, type WriteAudit } from "@noname/auth";
import type { AuthActor } from "@noname/auth";
import type { Context } from "hono";

export function taskIdFromRequest(c: Context): string | undefined {
  const raw = c.req.header("x-agent-task-id")?.trim();
  return raw || undefined;
}

export function auditFromContext(c: Context, actor: AuthActor): WriteAudit {
  return writeAuditFromActor(actor, taskIdFromRequest(c));
}
