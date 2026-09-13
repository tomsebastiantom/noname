export type EvidenceRecordInput = {
  orgId: string;
  type: string;
  schemaVersion?: number;
  subjectType: string;
  subjectId: string;
  data: Record<string, unknown>;
  source: string;
  occurredAt?: Date;
  correlationId?: string;
  causationId?: string;
  idempotencyKey?: string;
  integrityHash?: string;
};

export type EvidenceActivityInput = {
  orgId: string;
  type: string;
  actorType: "user" | "service" | "provider" | "system";
  actorId?: string;
  inputRecordIds?: string[];
  outputRecordIds?: string[];
  data?: Record<string, unknown>;
  occurredAt?: Date;
  correlationId?: string;
  causationId?: string;
  idempotencyKey?: string;
};

export type EvidenceLinkInput = {
  orgId: string;
  fromId: string;
  toId: string;
  relation: string;
  metadata?: Record<string, unknown>;
};

export type EvidenceAuditInput = {
  orgId: string;
  action: string;
  actorType: "user" | "service" | "provider" | "system";
  actorId?: string;
  subjectType: string;
  subjectId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
  correlationId?: string;
  idempotencyKey?: string;
};

export type EvidenceRecord = EvidenceRecordInput & {
  id: string;
  recordedAt: Date;
};

export type EvidenceActivity = EvidenceActivityInput & {
  id: string;
  recordedAt: Date;
};

export type EvidenceLink = EvidenceLinkInput & {
  id: string;
  createdAt: Date;
};

export type EvidenceAuditEvent = EvidenceAuditInput & {
  id: string;
  recordedAt: Date;
};

export type EvidenceListQuery = {
  orgId: string;
  type?: string;
  subjectType?: string;
  subjectId?: string;
  limit?: number;
  cursor?: string;
};

export interface EvidenceService {
  appendRecord(input: EvidenceRecordInput): Promise<EvidenceRecord>;
  appendActivity(input: EvidenceActivityInput): Promise<EvidenceActivity>;
  link(input: EvidenceLinkInput): Promise<EvidenceLink>;
  audit(input: EvidenceAuditInput): Promise<EvidenceAuditEvent>;
  listRecords(query: EvidenceListQuery): Promise<EvidenceRecord[]>;
  listLinks(orgId: string, recordId: string): Promise<EvidenceLink[]>;
  listAudit(orgId: string, subjectType?: string, subjectId?: string): Promise<EvidenceAuditEvent[]>;
}
