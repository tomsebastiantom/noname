export const COMMERCE_ORDER_PAID_ACTIVITY_TYPE = "commerce.order.paid";
export const COMMERCE_ORDER_PAID_ACTIVITY_VERSION = 1 as const;

/** The minimal Commerce fact needed to describe a paid order. */
export type CommerceOrderPaidFacts = Record<string, unknown> & {
  order: Record<string, unknown> & {
    status: "paid";
  };
};

export interface CommerceRegisteredActivityType {
  type: string;
  version: number;
  description?: string;
  fields: Record<
    string,
    {
      type: "string" | "number" | "boolean" | "date";
      operators: Array<"equals">;
    }
  >;
  validateFacts(facts: unknown): facts is Record<string, unknown>;
}

export interface CommercePaidOrderActivity {
  orgId: string;
  activityId: string;
  type: typeof COMMERCE_ORDER_PAID_ACTIVITY_TYPE;
  version: typeof COMMERCE_ORDER_PAID_ACTIVITY_VERSION;
  subjectUserId: string | null;
  occurredAt: Date;
  facts: CommerceOrderPaidFacts;
}

/**
 * Structural subset of AudienceService used by Commerce. Keeping this port local
 * prevents the vertical package from depending on the server implementation.
 */
export interface CommerceActivityPublisher {
  activityTypes: {
    register(definition: CommerceRegisteredActivityType): void;
  };
  processActivity(activity: CommercePaidOrderActivity): Promise<unknown>;
}

export const COMMERCE_ORDER_PAID_ACTIVITY_V1: CommerceRegisteredActivityType = {
  type: COMMERCE_ORDER_PAID_ACTIVITY_TYPE,
  version: COMMERCE_ORDER_PAID_ACTIVITY_VERSION,
  description: "A Commerce cart completed payment successfully.",
  fields: {
    "order.status": { type: "string", operators: ["equals"] },
  },
  validateFacts(facts): facts is Record<string, unknown> {
    return isCommerceOrderPaidFacts(facts);
  },
};

export function registerCommerceActivityTypes(
  activityTypes: CommerceActivityPublisher["activityTypes"],
): void {
  activityTypes.register(COMMERCE_ORDER_PAID_ACTIVITY_V1);
}

export function isCommerceOrderPaidFacts(facts: unknown): facts is CommerceOrderPaidFacts {
  if (!isRecord(facts) || !hasExactKeys(facts, ["order"])) return false;
  const order = facts.order;
  return isRecord(order) && hasExactKeys(order, ["status"]) && order.status === "paid";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
