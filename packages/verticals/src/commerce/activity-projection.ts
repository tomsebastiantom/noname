import {
  COMMERCE_ORDER_PAID_ACTIVITY_TYPE,
  COMMERCE_ORDER_PAID_ACTIVITY_VERSION,
  type CommerceActivityPublisher,
  type CommercePaidOrderActivity,
} from "./activity-types";
import type { CommerceTransitionComplete } from "./order-projection";

/**
 * Project the persisted paid-cart transition into the generic typed activity
 * contract. The audience engine, not Commerce, decides whether the fact assigns
 * a membership or how long any membership lasts.
 */
export function createCommerceActivityProjector(publisher: CommerceActivityPublisher) {
  return async (
    transition: CommerceTransitionComplete,
  ): Promise<CommercePaidOrderActivity | null> => {
    if (!isPaidCartTransition(transition)) return null;

    const occurredAt = transition.instance.updatedAt;
    if (!(occurredAt instanceof Date) || Number.isNaN(occurredAt.getTime())) {
      throw new Error("Paid Commerce transition is missing a valid persisted timestamp");
    }

    const activity: CommercePaidOrderActivity = {
      orgId: transition.orgId,
      activityId: commercePaidActivityId(transition),
      type: COMMERCE_ORDER_PAID_ACTIVITY_TYPE,
      version: COMMERCE_ORDER_PAID_ACTIVITY_VERSION,
      subjectUserId: persistedOwnerUserId(transition.instance.context),
      occurredAt,
      facts: { order: { status: "paid" } },
    };

    await publisher.processActivity(activity);
    return activity;
  };
}

function isPaidCartTransition(transition: CommerceTransitionComplete): boolean {
  return (
    transition.event === "PAYMENT_SUCCEEDED" &&
    transition.instance.machineName === "cart" &&
    transition.fromState !== "paid" &&
    transition.toState === "paid" &&
    transition.instance.currentState === "paid"
  );
}

function persistedOwnerUserId(context: Record<string, unknown>): string | null {
  const ownerUserId = context.ownerUserId;
  if (typeof ownerUserId !== "string") return null;
  const normalized = ownerUserId.trim();
  return normalized.length > 0 ? normalized : null;
}

/** Stable across provider deliveries: identifies the persisted machine transition. */
function commercePaidActivityId(transition: CommerceTransitionComplete): string {
  return [
    COMMERCE_ORDER_PAID_ACTIVITY_TYPE,
    transition.instance.id,
    transition.fromState,
    transition.toState,
    transition.instance.updatedAt.toISOString(),
  ].join(":");
}
