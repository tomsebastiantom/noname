export type FlagType = "boolean" | "multivariate" | "percentage";
export type FlagStatus = "active" | "inactive" | "archived";

export interface TargetingRule {
  priority: number;
  condition: Condition;
  value: unknown;
}

export type Condition =
  | { type: "segment"; hash: string }
  | { type: "segment_group"; hashes: string[] }
  | { type: "percentage"; percent: number; seed?: string }
  | { type: "property_match"; property: string; operator: string; value: unknown }
  | { type: "always" }
  | { type: "expression"; expr: string };

export interface FlagEvaluationContext {
  orgId: string;
  contextHash: string;
  contextProperties: Record<string, string | number | boolean>;
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
  contextHash: string;
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
  contextHash?: string;
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
    contexts: FlagEvaluationContext[],
    flagKeys?: string[],
  ): Promise<{ contextHash: string; evaluations: EvaluationResult[] }[]>;
  listEvaluations(
    orgId: string,
    flagId: string,
    filters?: EvaluationFilters,
  ): Promise<EvaluationRecord[]>;
}
