export type FlagType = "boolean" | "multivariate" | "percentage";
export type FlagStatus = "active" | "inactive" | "archived";

export type EvaluationSubject = {
  kind: "account" | "session" | "global";
  key: string;
};

export type ContextPropertyValue = string | number | boolean;
export type ContextProperties = Record<string, ContextPropertyValue>;

export interface TargetingRule {
  priority: number;
  condition: Condition;
  value: unknown;
}

export type Condition =
  | { type: "audience"; key: string }
  | { type: "audience_group"; keys: string[] }
  | { type: "percentage"; percent: number; seed?: string }
  | {
      type: "property_match";
      property: string;
      operator: "eq" | "neq" | "in" | "gt" | "lt";
      value: ContextPropertyValue | ContextPropertyValue[];
    }
  | { type: "always" }
  | { type: "expression"; expr: string };

export interface FlagEvaluationContext {
  orgId: string;
  subject: EvaluationSubject;
  audienceKeys: string[];
  contextProperties: ContextProperties;
  schemaId: string | null;
  variantId: string | null;
}

export interface FlagDTO {
  id: string;
  orgId: string;
  key: string;
  type: FlagType;
  description: string;
  defaultValue: unknown;
  targeting: TargetingRule[];
  status: FlagStatus;
  schemaId: string | null;
  variantId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EvaluationResult {
  flagKey: string;
  flagId: string;
  value: unknown;
  matchedRule: number | null;
  reason: string;
}

export interface EvaluationRecord {
  id: string;
  flagId: string;
  orgId: string;
  /** Null only for pre-subject legacy history whose subject could not be recovered. */
  subjectKind: EvaluationSubject["kind"] | null;
  value: unknown;
  matchedRule: number | null;
  reason: string;
  schemaId: string | null;
  variantId: string | null;
  evaluatedAt: Date;
}

export interface CreateFlagInput {
  key: string;
  type: FlagType;
  description?: string;
  defaultValue: unknown;
  targeting?: TargetingRule[];
  schemaId?: string | null;
  variantId?: string | null;
}

export interface UpdateFlagInput {
  description?: string;
  defaultValue?: unknown;
  targeting?: TargetingRule[];
  status?: FlagStatus;
  schemaId?: string | null;
  variantId?: string | null;
}

export interface FlagStorage {
  create(orgId: string, input: CreateFlagInput): Promise<FlagDTO>;
  findById(orgId: string, id: string): Promise<FlagDTO | null>;
  findByKey(orgId: string, key: string): Promise<FlagDTO | null>;
  list(orgId: string, filters?: FlagFilters): Promise<FlagDTO[]>;
  update(orgId: string, id: string, input: UpdateFlagInput): Promise<FlagDTO>;
  archive(orgId: string, id: string): Promise<FlagDTO>;
  recordEvaluation(record: Omit<EvaluationRecord, "id">): Promise<void>;
  /** Bulk insert — used on the per-request evaluate() path so N flags cost one round-trip, not N. */
  recordEvaluations(records: Omit<EvaluationRecord, "id">[]): Promise<void>;
  listEvaluations(flagId: string, filters?: EvaluationFilters): Promise<EvaluationRecord[]>;
}

export interface FlagFilters {
  status?: FlagStatus;
  schemaId?: string | null;
  type?: FlagType;
}

export interface EvaluationFilters {
  from?: Date;
  to?: Date;
  subjectKind?: EvaluationSubject["kind"];
}

export interface FlagService {
  create(orgId: string, input: CreateFlagInput): Promise<FlagDTO>;
  list(orgId: string, filters?: FlagFilters): Promise<FlagDTO[]>;
  get(orgId: string, id: string): Promise<FlagDTO | null>;
  update(orgId: string, id: string, input: UpdateFlagInput): Promise<FlagDTO>;
  archive(orgId: string, id: string): Promise<FlagDTO>;
  evaluate(
    orgId: string,
    context: Partial<FlagEvaluationContext>,
    flagKeys?: string[],
  ): Promise<EvaluationResult[]>;
  evaluateBatch(
    orgId: string,
    contexts: Partial<FlagEvaluationContext>[],
    flagKeys?: string[],
  ): Promise<{ subjectKind: EvaluationSubject["kind"]; evaluations: EvaluationResult[] }[]>;
  listEvaluations(
    orgId: string,
    flagId: string,
    filters?: EvaluationFilters,
  ): Promise<EvaluationRecord[]>;
}
