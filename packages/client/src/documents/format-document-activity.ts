import { sessionUserId } from "../auth/session";
import { formatTimeAgo } from "../lib/format-time-ago";
import type { DocumentOpRow } from "./document-ops";

export type DocumentActivityLabels = {
  lastEditTemplate: string;
  lastPublishTemplate: string;
  lastEditYouLabel: string;
  lastEditAgentLabel: string;
  lastEditSomeoneLabel: string;
};

function interpolate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

function formatActorName(
  op: DocumentOpRow,
  labels: Pick<DocumentActivityLabels, "lastEditYouLabel" | "lastEditAgentLabel" | "lastEditSomeoneLabel">,
): string {
  const selfId = sessionUserId();
  if (selfId && op.actorId === selfId) return labels.lastEditYouLabel;
  if (op.actorType === "agent") return labels.lastEditAgentLabel;
  if (op.actorId.includes("@")) {
    const local = op.actorId.split("@")[0] ?? op.actorId;
    if (!local) return labels.lastEditSomeoneLabel;
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return labels.lastEditSomeoneLabel;
}

function activityTemplateForOp(
  op: DocumentOpRow,
  labels: DocumentActivityLabels,
): string | null {
  if (op.operation === "publish") return labels.lastPublishTemplate;
  if (op.operation === "update" || op.operation === "create") return labels.lastEditTemplate;
  return null;
}

/** Latest op suitable for save-bar activity (skips delete/archive). */
export function pickActivityOp(ops: DocumentOpRow[]): DocumentOpRow | null {
  for (let i = ops.length - 1; i >= 0; i--) {
    const op = ops[i]!;
    if (op.operation === "delete" || op.operation === "archive") continue;
    if (op.operation === "publish" || op.operation === "update" || op.operation === "create") {
      return op;
    }
  }
  return null;
}

export function formatDocumentActivity(
  op: DocumentOpRow,
  labels: DocumentActivityLabels,
  nowMs = Date.now(),
): string | null {
  const template = activityTemplateForOp(op, labels);
  if (!template) return null;
  const timeAgo = formatTimeAgo(op.createdAt, nowMs);
  if (!timeAgo) return null;
  return interpolate(template, {
    actor: formatActorName(op, labels),
    timeAgo,
  });
}
