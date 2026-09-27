export const MAX_AUDIENCE_ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
export const MIN_AUDIENCE_LEDGER_RETENTION_MS = 31 * 24 * 60 * 60 * 1000;

export type AudienceOperator =
  | "equals"
  | "notEquals"
  | "in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "exists";
export type AudienceScalar = string | number | boolean;
export type AudienceFieldType = "string" | "number" | "boolean" | "date";
export interface RegisteredActivityField {
  type: AudienceFieldType;
  operators: AudienceOperator[];
}
export interface RegisteredActivityType {
  type: string;
  version: number;
  description?: string;
  fields: Record<string, RegisteredActivityField>;
  validateFacts(facts: unknown): facts is Record<string, unknown>;
}
export interface DomainActivity {
  orgId: string;
  activityId: string;
  type: string;
  version: number;
  subjectUserId?: string | null;
  occurredAt: Date;
  facts: Record<string, unknown>;
}
export interface ActivityTypeRegistry {
  register(definition: RegisteredActivityType): void;
  get(type: string, version: number): RegisteredActivityType | undefined;
  list(): Array<Omit<RegisteredActivityType, "validateFacts">>;
  validate(activity: DomainActivity): void;
}
export type AudienceCondition =
  | { all: AudienceCondition[] }
  | { any: AudienceCondition[] }
  | { field: string; operator: AudienceOperator; value?: unknown };
export type AudienceExpiry =
  | { afterMs: number }
  | {
      untilRevoked: true;
      revokedBy: { activityType: string; activityVersion: number; condition: AudienceCondition };
    }
  | Record<string, never>;
export interface AudienceDefinitionVersion {
  orgId: string;
  audienceKey: string;
  version: number;
  activityType: string;
  activityVersion: number;
  condition: AudienceCondition;
  action: "assign" | "remove";
  expiry: AudienceExpiry;
  status: "draft" | "active" | "superseded";
  createdBy: string;
  createdAt: Date;
  activatedAt?: Date | null;
}
export interface AudienceDefinition {
  id: string;
  orgId: string;
  key: string;
  status: "draft" | "active" | "disabled" | "archived";
  activeVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
  versions?: AudienceDefinitionVersion[];
}
export interface ExperienceBindingInput {
  pageKey: string;
  locale?: string | null;
  schemaId: string;
  variantId: string;
  goalEvent: string;
  attributionWindowMs: number;
}
export interface ExperienceBinding extends ExperienceBindingInput {
  id: string;
  orgId: string;
  audienceKey: string;
  version: number;
  status: "draft" | "active" | "superseded";
  createdBy: string;
  createdAt: Date;
  activatedAt?: Date | null;
}
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
export interface ExperienceRequestContext {
  pageKey: string;
  locale: string | null;
}
export interface AudienceExperienceMatch {
  membership: AudienceAssignment;
  binding: ExperienceBinding;
}
export interface ExperienceDecisionRecord {
  decisionId: string;
  orgId: string;
  verifiedUserId: string;
  sessionId: string;
  audienceKey: string;
  audienceDefinitionVersion: number;
  bindingId: string;
  bindingVersion: number;
  pageKey: string;
  locale: string | null;
  schemaId: string;
  variantId: string;
  goalEvent: string;
  attributionWindowMs: number;
  servedAt: Date;
  renderedAt: Date | null;
  renderDeadlineAt: Date;
  expiresAt: Date;
}
export type ExperienceDecisionDimensions = Pick<
  ExperienceDecisionRecord,
  | "decisionId"
  | "sessionId"
  | "audienceKey"
  | "audienceDefinitionVersion"
  | "bindingId"
  | "bindingVersion"
  | "pageKey"
  | "locale"
  | "schemaId"
  | "variantId"
>;
export interface ExperienceOutcomeAttribution extends ExperienceDecisionDimensions {
  duplicate: boolean;
}
export interface ExperienceDecisionRenderInput {
  orgId: string;
  verifiedUserId: string;
  sessionId: string;
  decisionId: string;
  renderedAt: Date;
}
export interface AudienceExperiencePerformanceFilters {
  orgId: string;
  audienceKey: string;
  from: Date;
  to: Date;
}
export interface AudienceExperiencePerformanceBinding {
  audienceDefinitionVersion: number | null;
  bindingId: string;
  bindingVersion: number;
  servedDecisionCount: number;
  renderedDecisionCount: number;
  exposedAccountCount: number;
  outcomeAccountCount: number;
}
export interface MarkedExperienceDecision {
  decision: ExperienceDecisionRecord;
  newlyRendered: boolean;
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
export interface AudienceStorage {
  createDefinition(orgId: string, key: string, actorId: string): Promise<AudienceDefinition>;
  getDefinition(orgId: string, key: string): Promise<AudienceDefinition | null>;
  listDefinitions(orgId: string): Promise<AudienceDefinition[]>;
  createVersion(input: AudienceDefinitionVersion): Promise<AudienceDefinitionVersion>;
  activateVersion(
    orgId: string,
    key: string,
    version: number,
    at: Date,
    actorId?: string,
  ): Promise<AudienceDefinitionVersion>;
  setStatus(
    orgId: string,
    key: string,
    status: "disabled" | "archived",
    actorId: string,
  ): Promise<AudienceDefinition | null>;
  createBinding(
    input: Omit<ExperienceBinding, "id" | "version" | "status" | "createdAt" | "activatedAt">,
  ): Promise<ExperienceBinding>;
  listBindings(orgId: string, audienceKey: string): Promise<ExperienceBinding[]>;
  activateBinding(
    orgId: string,
    key: string,
    version: number,
    at: Date,
    actorId?: string,
  ): Promise<ExperienceBinding>;
  ensureReceipt(
    activity: DomainActivity,
  ): Promise<{ status: "pending" | "processed"; inserted: boolean }>;
  activeVersions(orgId: string): Promise<AudienceDefinitionVersion[]>;
  completeActivity(
    orgId: string,
    activityId: string,
    changes: AssignmentChange[],
    at: Date,
  ): Promise<void>;
  getActiveMemberships(orgId: string, userId: string, asOf: Date): Promise<AudienceAssignment[]>;
  getActiveBindings(orgId: string, audienceKey: string): Promise<ExperienceBinding[]>;
  getExperiencePerformance(
    filters: AudienceExperiencePerformanceFilters,
  ): Promise<AudienceExperiencePerformanceBinding[]>;
  insertExperienceDecision(decision: ExperienceDecisionRecord): Promise<void>;
  cleanupExpiredExperienceDecisions(at: Date): Promise<void>;
  markExperienceDecisionRendered(
    input: ExperienceDecisionRenderInput,
  ): Promise<MarkedExperienceDecision | null>;
  attributeTrustedGoal(
    activity: DomainActivity,
    at: Date,
  ): Promise<ExperienceOutcomeAttribution | null>;
}
export interface AudienceService {
  readonly activityTypes: ActivityTypeRegistry;
  createDefinition(orgId: string, key: string, actorId: string): Promise<AudienceDefinition>;
  listDefinitions(orgId: string): Promise<AudienceDefinition[]>;
  getDefinition(orgId: string, key: string): Promise<AudienceDefinition | null>;
  createVersion(
    orgId: string,
    key: string,
    input: Omit<
      AudienceDefinitionVersion,
      "orgId" | "audienceKey" | "version" | "status" | "createdAt" | "activatedAt"
    >,
  ): Promise<AudienceDefinitionVersion>;
  validateVersion(
    orgId: string,
    key: string,
    version: number,
    sample?: DomainActivity,
  ): Promise<{ valid: boolean; matches?: boolean }>;
  activateVersion(
    orgId: string,
    key: string,
    version: number,
    actorId?: string,
  ): Promise<AudienceDefinitionVersion>;
  setStatus(
    orgId: string,
    key: string,
    status: "disabled" | "archived",
    actorId: string,
  ): Promise<AudienceDefinition | null>;
  createBinding(
    orgId: string,
    key: string,
    actorId: string,
    input: ExperienceBindingInput,
  ): Promise<ExperienceBinding>;
  listBindings(orgId: string, key: string): Promise<ExperienceBinding[]>;
  activateBinding(
    orgId: string,
    key: string,
    version: number,
    actorId?: string,
  ): Promise<ExperienceBinding>;
  processActivity(
    activity: DomainActivity,
  ): Promise<{ duplicate: boolean; changes: AssignmentChange[] }>;
  getActiveMemberships(orgId: string, userId: string, asOf?: Date): Promise<AudienceAssignment[]>;
  resolveExperience(
    orgId: string,
    userId: string,
    context: ExperienceRequestContext,
    asOf?: Date,
  ): Promise<AudienceExperienceMatch | null>;
  getActiveBindings(orgId: string, audienceKey: string): Promise<ExperienceBinding[]>;
  getExperiencePerformance(
    filters: AudienceExperiencePerformanceFilters,
  ): Promise<AudienceExperiencePerformanceBinding[]>;
  createExperienceDecision(
    orgId: string,
    verifiedUserId: string,
    sessionId: string,
    match: AudienceExperienceMatch,
    servedAt?: Date,
  ): Promise<ExperienceDecisionDimensions>;
  markExperienceDecisionRendered(
    orgId: string,
    verifiedUserId: string,
    sessionId: string,
    decisionId: string,
    renderedAt?: Date,
  ): Promise<{ dimensions: ExperienceDecisionDimensions; newlyRendered: boolean } | null>;
  attributeTrustedGoal(activity: DomainActivity): Promise<ExperienceOutcomeAttribution | null>;
}
