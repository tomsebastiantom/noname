import { describe, expect, it, vi } from "vitest";
import { createCommerceActivityProjector } from "./activity-projection";
import {
  COMMERCE_ORDER_PAID_ACTIVITY_TYPE,
  COMMERCE_ORDER_PAID_ACTIVITY_VERSION,
  type CommerceActivityPublisher,
  isCommerceOrderPaidFacts,
  registerCommerceActivityTypes,
} from "./activity-types";
import type { CommerceTransitionComplete } from "./order-projection";

function publisher() {
  const register = vi.fn<CommerceActivityPublisher["activityTypes"]["register"]>();
  const processActivity = vi
    .fn<CommerceActivityPublisher["processActivity"]>()
    .mockResolvedValue(undefined);
  return { activityTypes: { register }, processActivity } satisfies CommerceActivityPublisher;
}

function paidCartTransition(
  overrides: Partial<CommerceTransitionComplete> = {},
): CommerceTransitionComplete {
  return {
    orgId: "org-test",
    instance: {
      id: "cart-42",
      machineName: "cart",
      currentState: "paid",
      context: { ownerUserId: "shopper-7" },
      updatedAt: new Date("2026-09-26T10:11:12.345Z"),
    },
    event: "PAYMENT_SUCCEEDED",
    fromState: "awaiting_payment",
    toState: "paid",
    params: { paymentRef: "provider-payment-1" },
    ...overrides,
  };
}

describe("Commerce paid-order activity contract", () => {
  it("registers a versioned schema with only the minimal paid-status fact", () => {
    const target = publisher();
    registerCommerceActivityTypes(target.activityTypes);

    expect(target.activityTypes.register).toHaveBeenCalledTimes(1);
    const definition = target.activityTypes.register.mock.calls[0]?.[0];
    expect(definition).toMatchObject({
      type: COMMERCE_ORDER_PAID_ACTIVITY_TYPE,
      version: COMMERCE_ORDER_PAID_ACTIVITY_VERSION,
      fields: { "order.status": { type: "string", operators: ["equals"] } },
    });
    expect(definition?.validateFacts({ order: { status: "paid" } })).toBe(true);
    expect(definition?.validateFacts({ order: { status: "paid", amount: 4200 } })).toBe(false);
  });

  it("validates exactly the registered facts shape", () => {
    expect(isCommerceOrderPaidFacts({ order: { status: "paid" } })).toBe(true);
    expect(isCommerceOrderPaidFacts({ order: { status: "pending" } })).toBe(false);
    expect(isCommerceOrderPaidFacts({ order: { status: "paid", ref: "order-1" } })).toBe(false);
    expect(isCommerceOrderPaidFacts({ "order.status": "paid" })).toBe(false);
    expect(isCommerceOrderPaidFacts({ order: { status: "paid" }, customer: "shopper-7" })).toBe(
      false,
    );
  });
});

describe("Commerce paid-order activity projection", () => {
  it.each([
    ["non-payment event", { event: "PAYMENT_FAILED" }],
    ["non-cart machine", { instance: { ...paidCartTransition().instance, machineName: "refund" } }],
    [
      "transition not into paid",
      {
        toState: "active",
        instance: { ...paidCartTransition().instance, currentState: "active" },
      },
    ],
  ] as const)("ignores %s", async (_label, overrides) => {
    const target = publisher();
    await createCommerceActivityProjector(target)(paidCartTransition(overrides));
    expect(target.processActivity).not.toHaveBeenCalled();
  });

  it("emits stable facts for the persisted transition, ignoring delivery and param identity", async () => {
    const target = publisher();
    const project = createCommerceActivityProjector(target);
    const original = paidCartTransition({
      params: { ownerUserId: "spoofed-a", providerEventId: "delivery-a" },
    });
    const redelivery = paidCartTransition({
      params: { ownerUserId: "spoofed-b", providerEventId: "delivery-b" },
    });

    await project(original);
    await project(redelivery);

    expect(target.processActivity).toHaveBeenCalledTimes(2);
    const first = target.processActivity.mock.calls[0]?.[0];
    const second = target.processActivity.mock.calls[1]?.[0];
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      orgId: "org-test",
      activityId: "commerce.order.paid:cart-42:awaiting_payment:paid:2026-09-26T10:11:12.345Z",
      type: "commerce.order.paid",
      version: 1,
      subjectUserId: "shopper-7",
      facts: { order: { status: "paid" } },
    });
    expect(first?.occurredAt).toBe(original.instance.updatedAt);
    expect(first?.activityId).not.toContain("delivery-");
    expect(first?.facts).toEqual({ order: { status: "paid" } });
  });

  it("emits a null subject for a guest and ignores an owner in event params", async () => {
    const target = publisher();
    const project = createCommerceActivityProjector(target);
    const transition = paidCartTransition({
      instance: {
        ...paidCartTransition().instance,
        context: { guest: true, ownerUserId: null },
      },
      params: { ownerUserId: "untrusted-param-user" },
    });

    await project(transition);

    expect(target.processActivity).toHaveBeenCalledWith(
      expect.objectContaining({ subjectUserId: null }),
    );
  });
});
