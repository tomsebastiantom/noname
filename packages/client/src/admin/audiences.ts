import { apiFetchData, apiFetchDataOptional, apiFetchVoid } from "../lib/api";
import { isAggregateAudienceMetrics } from "./audience-authoring";

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
}

export type AudienceCondition =
  | { all: AudienceCondition[] }
  | { any: AudienceCondition[] }
  | { field: string; operator: AudienceOperator; value?: unknown };
export type AudienceExpiry = { afterMs: number } | { untilRevoked: true };

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
  createdAt: string;
  activatedAt?: string | null;
}

export interface AudienceDefinition {
  id: string;
  orgId: string;
  key: string;
  status: "draft" | "active" | "disabled" | "archived";
  activeVersion: number | null;
  createdAt: string;
  updatedAt: string;
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
  createdAt: string;
  activatedAt?: string | null;
}

export type AudiencePerformanceSampleStatus =
  | "insufficient_exposed_accounts"
  | "outcomes_suppressed"
  | "available";

export interface AudienceBindingPerformance {
  audienceDefinitionVersion: number | null;
  bindingId: string;
  bindingVersion: number;
  sampleStatus: AudiencePerformanceSampleStatus;
  servedDecisionCount: number | null;
  renderedDecisionCount: number | null;
  exposedAccountCount: number | null;
  outcomeAccountCount: number | null;
  outcomeRate: number | null;
}

export interface AudiencePerformanceSummary {
  audienceKey: string;
  from: string;
  to: string;
  rateLabel: "observational_not_causal";
  rateDenominator: "exposedAccountCount";
  minimumSampleSize: number;
  bindings: AudienceBindingPerformance[];
}

const BASE = "/api/audiences";
const jsonHeaders = { "Content-Type": "application/json" };

export function listActivityTypes(): Promise<RegisteredActivityType[]> {
  return apiFetchData(`${BASE}/activity-types`);
}

export function listAudiences(): Promise<AudienceDefinition[]> {
  return apiFetchData(`${BASE}/definitions`);
}

export function createAudience(key: string): Promise<AudienceDefinition> {
  return apiFetchData(`${BASE}/definitions`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ key }),
  });
}

export function createAudienceVersion(
  key: string,
  input: Pick<
    AudienceDefinitionVersion,
    "activityType" | "activityVersion" | "condition" | "action" | "expiry"
  >,
): Promise<AudienceDefinitionVersion> {
  return apiFetchData(`${BASE}/definitions/${encodeURIComponent(key)}/versions`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export function validateAudienceVersion(
  key: string,
  version: number,
): Promise<{ valid: boolean; matches?: boolean }> {
  return apiFetchData(
    `${BASE}/definitions/${encodeURIComponent(key)}/versions/${version}/validate`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({}),
    },
  );
}

export function activateAudienceVersion(
  key: string,
  version: number,
): Promise<AudienceDefinitionVersion> {
  return apiFetchData(
    `${BASE}/definitions/${encodeURIComponent(key)}/versions/${version}/activate`,
    {
      method: "POST",
    },
  );
}

export function archiveAudience(key: string): Promise<AudienceDefinition> {
  return apiFetchData(`${BASE}/definitions/${encodeURIComponent(key)}`, { method: "DELETE" });
}

export function listExperienceBindings(key: string): Promise<ExperienceBinding[]> {
  return apiFetchData(`${BASE}/definitions/${encodeURIComponent(key)}/experience-bindings`);
}

export function createExperienceBinding(
  key: string,
  input: ExperienceBindingInput,
): Promise<ExperienceBinding> {
  return apiFetchData(`${BASE}/definitions/${encodeURIComponent(key)}/experience-bindings`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(input),
  });
}

export function activateExperienceBinding(
  key: string,
  version: number,
): Promise<ExperienceBinding> {
  return apiFetchData(
    `${BASE}/definitions/${encodeURIComponent(key)}/experience-bindings/${version}/activate`,
    {
      method: "POST",
    },
  );
}

/** The analytics endpoint is optional until the observational aggregate is mounted. */
export async function fetchAudiencePerformance(
  key: string,
): Promise<AudiencePerformanceSummary | null> {
  const result = await apiFetchDataOptional<unknown>(
    `/api/analytics/audiences/${encodeURIComponent(key)}/performance`,
  );
  return isAggregateAudienceMetrics(result) ? result : null;
}

export async function disableAudience(key: string): Promise<void> {
  await apiFetchVoid(`${BASE}/definitions/${encodeURIComponent(key)}/disable`, { method: "POST" });
}
