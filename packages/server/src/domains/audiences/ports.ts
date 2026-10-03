import type { AudienceRuleService, AudienceRuleStorage } from "./activity-rules";
import type {
  AudienceExperienceService,
  AudienceExperienceStorage,
} from "./experience-attribution";
import type { AudienceMembershipService, AudienceMembershipStorage } from "./membership";

export type {
  ActivityTypeRegistry,
  AudienceCondition,
  AudienceDefinition,
  AudienceDefinitionVersion,
  AudienceExpiry,
  AudienceFieldType,
  AudienceOperator,
  AudienceRuleService,
  AudienceRuleStorage,
  AudienceScalar,
  DomainActivity,
  RegisteredActivityField,
  RegisteredActivityType,
} from "./activity-rules";
export type {
  AudienceExperienceBindingService,
  AudienceExperienceDeliveryService,
  AudienceExperienceMatch,
  AudienceExperienceMeasurementService,
  AudienceExperiencePerformanceBinding,
  AudienceExperiencePerformanceFilters,
  AudienceExperienceService,
  AudienceExperienceStorage,
  ExperienceBinding,
  ExperienceBindingInput,
  ExperienceDecisionDimensions,
  ExperienceDecisionRecord,
  ExperienceDecisionRenderInput,
  ExperienceOutcomeAttribution,
  ExperienceRequestContext,
  MarkedExperienceDecision,
} from "./experience-attribution";
export {
  MAX_AUDIENCE_ATTRIBUTION_WINDOW_DAYS,
  MILLISECONDS_PER_DAY,
  MIN_AUDIENCE_LEDGER_RETENTION_MS,
  attributionWindowDaysToMilliseconds,
  normalizeAttributionWindowDays,
} from "./experience-attribution";
export type {
  AssignmentChange,
  AudienceAssignment,
  AudienceMembershipService,
  AudienceMembershipStorage,
} from "./membership";

/** Aggregate adapter contract retained for the Audience composition root and tests. */
export interface AudienceStorage
  extends AudienceRuleStorage,
    AudienceMembershipStorage,
    AudienceExperienceStorage {}

/** Public facade composed from the focused rule, membership, and attribution capabilities. */
export interface AudienceService
  extends AudienceRuleService,
    AudienceMembershipService,
    AudienceExperienceService {}
