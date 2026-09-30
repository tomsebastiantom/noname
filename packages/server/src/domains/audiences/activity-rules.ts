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

/** A trusted, versioned fact envelope emitted by a server-owned domain. */
export interface DomainActivity {
  orgId: string;
  activityId: string;
  type: string;
  version: number;
  subjectUserId?: string | null;
  occurredAt: Date;
  facts: Record<string, unknown>;
}

/** Registry used to validate producer-owned activity schemas and expose safe rule fields. */
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

/** Persistence operations for authoring and activating tenant rule versions. */
export interface AudienceRuleStorage {
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
  activeVersions(orgId: string): Promise<AudienceDefinitionVersion[]>;
}

/** Tenant rule-authoring API; activity processing and rendering are separate capabilities. */
export interface AudienceRuleService {
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
}
