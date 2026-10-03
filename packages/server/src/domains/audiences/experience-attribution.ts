import type { DomainActivity } from "./activity-rules";
import type { AudienceAssignment } from "./membership";

export const MAX_AUDIENCE_ATTRIBUTION_WINDOW_DAYS = 30;
export const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
export const MIN_AUDIENCE_LEDGER_RETENTION_MS = 31 * MILLISECONDS_PER_DAY;

export function attributionWindowDaysToMilliseconds(days: number): number {
  return Math.round(days * MILLISECONDS_PER_DAY);
}

export function normalizeAttributionWindowDays(days: number): number {
  return Number(days.toFixed(12));
}

export interface ExperienceBindingInput {
  pageKey: string;
  locale?: string | null;
  schemaId: string;
  variantId: string;
  goalEvent: string;
  attributionWindowDays: number;
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
  attributionWindowDays: number;
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

/** Persistence operations for binding selection and the private attribution ledger. */
export interface AudienceExperienceStorage {
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

/** Admin-facing contract for binding an audience to a published experience. */
export interface AudienceExperienceBindingService {
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
}

/** Request-time experience selection and render confirmation used by Edge. */
export interface AudienceExperienceDeliveryService {
  resolveExperience(
    orgId: string,
    userId: string,
    context: ExperienceRequestContext,
    asOf?: Date,
  ): Promise<AudienceExperienceMatch | null>;
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
}

/** Trusted outcome attribution and aggregate performance queries. */
export interface AudienceExperienceMeasurementService {
  getActiveBindings(orgId: string, audienceKey: string): Promise<ExperienceBinding[]>;
  getExperiencePerformance(
    filters: AudienceExperiencePerformanceFilters,
  ): Promise<AudienceExperiencePerformanceBinding[]>;
  attributeTrustedGoal(activity: DomainActivity): Promise<ExperienceOutcomeAttribution | null>;
}

/** Composite experience surface retained for the Audience application service. */
export interface AudienceExperienceService
  extends AudienceExperienceBindingService,
    AudienceExperienceDeliveryService,
    AudienceExperienceMeasurementService {}
