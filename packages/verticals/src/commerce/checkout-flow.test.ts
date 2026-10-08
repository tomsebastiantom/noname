import { describe, expect, it } from "vitest";
import {
  createCommerceCapabilities,
  createCommerceProviderEventMappings,
  createStripeCheckoutAdapter,
} from "./capabilities";

const instanceId = "00000000-0000-4000-8000-000000000002";

describe("commerce checkout flow contract", () => {
  it("moves an active cart to awaiting payment, then maps provider success to paid", async () => {
    let state = "active";
    let revision = 1;
    let context: Record<string, unknown> = {
      guest: true,
      currency: "usd",
      items: [{ productId: "p1", quantity: 1 }],
    };
    const transitions: string[] = [];
    const transition = async (
      _orgId: string,
      _id: string,
      event: string,
      params: Record<string, unknown> = {},
      _expectedRevision?: number,
    ) => {
      transitions.push(event);
      context = { ...context, ...params };
      state =
        event === "checkout_reserving"
          ? "checkout_pending"
          : event === "checkout_started"
            ? "awaiting_payment"
            : event === "PAYMENT_SUCCEEDED"
              ? "paid"
              : state;
      revision += 1;
      return {
        id: instanceId,
        machineName: "cart",
        currentState: state,
        context,
        revision,
        createdAt: new Date("2026-10-01T12:00:00Z"),
        updatedAt: new Date("2026-10-01T12:10:00Z"),
      };
    };
    const capabilities = createCommerceCapabilities({
      machines: {
        getInstance: async () => ({
          id: instanceId,
          machineName: "cart",
          currentState: state,
          context,
          revision,
          createdAt: new Date("2026-10-01T12:00:00Z"),
          updatedAt: new Date("2026-10-01T12:10:00Z"),
        }),
        transition,
      },
      integrations: {
        proxyProvider: async <T>() =>
          ({ id: "cs_flow", url: "https://checkout.test/cs_flow" }) as T,
      },
      catalog: {
        findByType: async () => [
          { data: { id: "p1", price: 9.99, currency: "USD" }, status: "published" },
        ],
      },
      checkoutProviders: { stripe: createStripeCheckoutAdapter() },
    });

    await capabilities["commerce.checkout"](
      { instanceId, integrationId: "stripe" },
      { orgId: "org-1", requestId: "request-flow", idempotencyKey: "flow-1" },
    );
    expect(state).toBe("awaiting_payment");

    const successMapping = createCommerceProviderEventMappings()[0];
    const normalized = successMapping?.normalize({
      orgId: "org-1",
      integrationId: "stripe",
      connectionId: "connection-1",
      providerEventId: "evt-flow",
      eventType: "checkout.session.completed",
      payload: {
        client_reference_id: instanceId,
        payment_intent: "pi_flow",
        payment_status: "paid",
        amount_total: 999,
        currency: "usd",
        metadata: {},
      },
    });
    expect(normalized?.event).toBe("PAYMENT_SUCCEEDED");
    expect(normalized?.machineInstanceId).toBe(instanceId);

    await transition("org-1", instanceId, normalized?.event ?? "", normalized?.params ?? {});
    expect(transitions).toEqual(["checkout_reserving", "checkout_started", "PAYMENT_SUCCEEDED"]);
    expect(state).toBe("paid");
  });
});
