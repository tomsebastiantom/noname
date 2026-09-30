import type { DomainActivity } from "./activity-rules";

export interface AudienceAssignment {
  orgId: string;
  userId: string;
  audienceKey: string;
  sourceActivityId: string;
  definitionVersion: number;
  assignedAt: Date;
  expiresAt: Date | null;
  revokedAt: Date | null;
}

export interface AssignmentChange {
  orgId: string;
  userId: string;
  audienceKey: string;
  activityId: string;
  definitionVersion: number;
  action: "assign" | "remove";
  occurredAt: Date;
  expiresAt: Date | null;
}

/** Persistence operations that own membership receipts, changes, and active lookups. */
export interface AudienceMembershipStorage {
  ensureReceipt(
    activity: DomainActivity,
  ): Promise<{ status: "pending" | "processed"; inserted: boolean }>;
  completeActivity(
    orgId: string,
    activityId: string,
    changes: AssignmentChange[],
    at: Date,
  ): Promise<void>;
  getActiveMemberships(orgId: string, userId: string, asOf: Date): Promise<AudienceAssignment[]>;
}

/** Activity-to-membership processing and request-time membership lookup. */
export interface AudienceMembershipService {
  processActivity(
    activity: DomainActivity,
  ): Promise<{ duplicate: boolean; changes: AssignmentChange[] }>;
  getActiveMemberships(orgId: string, userId: string, asOf?: Date): Promise<AudienceAssignment[]>;
}
