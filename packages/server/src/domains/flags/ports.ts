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
  tenantId: string;
  contextHash: string;
  contextProperties: Record<string, string | number | boolean>;
  schemaId: string | null;
  variantId: string | null;
}

export interface FlagDTO {
  id: string;
  tenantId: string;
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
  tenantId: string;
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
  create(tenantId: string, input: CreateFlagInput): Promise<FlagDTO>;
  findById(tenantId: string, id: string): Promise<FlagDTO | null>;
  findByKey(tenantId: string, key: string): Promise<FlagDTO | null>;
  list(tenantId: string, filters?: FlagFilters): Promise<FlagDTO[]>;
  update(tenantId: string, id: string, input: UpdateFlagInput): Promise<FlagDTO>;
  archive(tenantId: string, id: string): Promise<FlagDTO>;
  recordEvaluation(record: Omit<EvaluationRecord, "id">): Promise<void>;
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
  create(tenantId: string, input: CreateFlagInput): Promise<FlagDTO>;
  list(tenantId: string, filters?: FlagFilters): Promise<FlagDTO[]>;
  get(tenantId: string, id: string): Promise<FlagDTO | null>;
  update(tenantId: string, id: string, input: UpdateFlagInput): Promise<FlagDTO>;
  archive(tenantId: string, id: string): Promise<FlagDTO>;
  evaluate(
    tenantId: string,
    context: FlagEvaluationContext,
    flagKeys?: string[],
  ): Promise<EvaluationResult[]>;
  evaluateBatch(
    tenantId: string,
    contexts: FlagEvaluationContext[],
    flagKeys?: string[],
  ): Promise<{ contextHash: string; evaluations: EvaluationResult[] }[]>;
  listEvaluations(
    tenantId: string,
    flagId: string,
    filters?: EvaluationFilters,
  ): Promise<EvaluationRecord[]>;
}
