import type { AuthActor } from "@noname/auth";
import { type WriteAudit, writeAuditFromActor } from "@noname/auth";
import type { Context } from "hono";

export function taskIdFromRequest(c: Context): string | undefined {
  const raw = c.req.header("x-agent-task-id")?.trim();
  return raw || undefined;
}

export function auditFromContext(c: Context, actor: AuthActor): WriteAudit {
  return writeAuditFromActor(actor, taskIdFromRequest(c));
}

/** Optional dedup keys for at-least-once editor saves (E3-pre). */
export function clientOpFromRequest(c: Context): { clientId?: string; clientSeq?: number } {
  const clientId = c.req.header("x-client-id")?.trim();
  const rawSeq = c.req.header("x-client-seq")?.trim();
  if (!clientId || !rawSeq) return {};
  const clientSeq = Number(rawSeq);
  if (!Number.isInteger(clientSeq) || clientSeq < 0) return {};
  return { clientId, clientSeq };
}
