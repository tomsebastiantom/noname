import type { EvidenceAuditInput } from "../evidence/ports";

/**
 * The release services only know an actor string today. Until the platform operator passes an explicit
 * service identity, "system" is the only non-human actor we can distinguish.
 */
export function auditActorType(actor: string): EvidenceAuditInput["actorType"] {
  return actor === "system" ? "system" : "user";
}
