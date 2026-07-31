import { AggregateRoot } from "../../shared/aggregate-root";
import type { FlagDTO, FlagStatus, FlagType, TargetingRule } from "./ports";

export class FeatureFlag extends AggregateRoot {
  constructor(
    public readonly id: string,
    public readonly orgId: string,
    public key: string,
    public type: FlagType,
    public description: string,
    public defaultValue: unknown,
    public targeting: TargetingRule[],
    public status: FlagStatus,
    public schemaId: string | null,
    public variantId: string | null,
    public readonly createdAt: Date,
    public updatedAt: Date,
  ) {
    super();
  }

  static create(
    orgId: string,
    key: string,
    type: FlagType,
    description: string,
    defaultValue: unknown,
    targeting: TargetingRule[],
    schemaId: string | null,
    variantId: string | null,
  ): FeatureFlag {
    const flag = new FeatureFlag(
      crypto.randomUUID(),
      orgId,
      key,
      type,
      description,
      defaultValue,
      targeting,
      "active",
      schemaId,
      variantId,
      new Date(),
      new Date(),
    );
    flag.apply("flag.created", {
      flagId: flag.id,
      orgId,
      key,
      type,
    });
    return flag;
  }

  static fromDTO(dto: FlagDTO): FeatureFlag {
    return new FeatureFlag(
      dto.id,
      dto.orgId,
      dto.key,
      dto.type,
      dto.description,
      dto.defaultValue,
      dto.targeting,
      dto.status,
      dto.schemaId,
      dto.variantId,
      dto.createdAt,
      dto.updatedAt,
    );
  }

  update(
    description?: string,
    defaultValue?: unknown,
    targeting?: TargetingRule[],
    status?: FlagStatus,
    schemaId?: string | null,
    variantId?: string | null,
  ): void {
    if (description !== undefined) this.description = description;
    if (defaultValue !== undefined) this.defaultValue = defaultValue;
    if (targeting !== undefined) this.targeting = targeting;
    if (status !== undefined) this.status = status;
    if (schemaId !== undefined) this.schemaId = schemaId;
    if (variantId !== undefined) this.variantId = variantId;
    this.updatedAt = new Date();
    this.apply("flag.updated", {
      flagId: this.id,
      orgId: this.orgId,
      key: this.key,
    });
  }

  archive(): void {
    this.status = "archived";
    this.updatedAt = new Date();
    this.apply("flag.archived", {
      flagId: this.id,
      orgId: this.orgId,
      key: this.key,
    });
  }
}
