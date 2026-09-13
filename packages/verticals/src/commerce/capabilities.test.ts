import { describe, expect, it, vi } from "vitest";
import {
  createCommerceCapabilities,
  createCommerceProviderEventMappings,
  createStripeCheckoutAdapter,
} from "./capabilities";

const instanceId = "00000000-0000-4000-8000-000000000001";

describe("commerce checkout capability", () => {
  it("derives the provider amount from the server catalog and starts payment", async () => {
    const transition = vi.fn(async () => undefined);
    const proxyMock = vi.fn(async () => ({ id: "cs_1", url: "https://checkout.test/cs_1" }));
    const proxy = proxyMock as unknown as <T = unknown>(input: unknown) => Promise<T>;
    const capabilities = createCommerceCapabilities({
      machines: {
        getInstance: async () => ({
          id: instanceId,
          machineName: "cart",
          currentState: "active",
          context: { currency: "usd", items: [{ productId: "p1", quantity: 2, price: 1 }] },
        }),
        transition,
      },
      integrations: { proxyProvider: proxy },
      catalog: {
        findByType: async () => [{ data: { id: "p1", price: 12.5 }, status: "published" }],
      },
      checkoutProviders: { stripe: createStripeCheckoutAdapter() },
    });

    const result = await capabilities["commerce.checkout"](
      { instanceId, integrationId: "stripe", metadata: { successUrl: "/success" } },
      { orgId: "org-1", requestId: "request-1", idempotencyKey: "attempt-1" },
    );

    expect(result).toEqual({
      provider: "stripe",
      externalCheckoutId: "cs_1",
      redirectUrl: "https://checkout.test/cs_1",
    });
    const proxyInput = (proxyMock.mock.calls[0] as unknown[])[0] as { data?: string };
    expect(
      new URLSearchParams(proxyInput.data ?? "").get("line_items[0][price_data][unit_amount]"),
    ).toBe("2500");
    expect(transition).toHaveBeenCalledWith("org-1", instanceId, "checkout_started", {
      checkoutId: "cs_1",
      checkoutProvider: "stripe",
      checkoutAmount: 2500,
      checkoutCurrency: "usd",
    });
  });
});

describe("commerce provider event mappings", () => {
  it("normalizes success and failure events without trusting provider org claims", () => {
    const mappings = createCommerceProviderEventMappings();
    const success = mappings[0]?.normalize({
      orgId: "org-1",
      integrationId: "stripe",
      connectionId: "connection-1",
      providerEventId: "evt-success",
      eventType: "checkout.session.completed",
      payload: { client_reference_id: instanceId, payment_intent: "pi_1", metadata: {} },
    });
    const failure = mappings[1]?.normalize({
      orgId: "org-1",
      integrationId: "stripe",
      connectionId: "connection-1",
      providerEventId: "evt-failure",
      eventType: "checkout.session.async_payment_failed",
      payload: { client_reference_id: instanceId, payment_status: "failed", metadata: {} },
    });

    expect(success?.event).toBe("PAYMENT_SUCCEEDED");
    expect(success?.machineInstanceId).toBe(instanceId);
    expect(failure?.event).toBe("PAYMENT_FAILED");
    expect(failure?.machineInstanceId).toBe(instanceId);
  });

  it("normalizes a second provider fixture through the same contract", () => {
    const mappings = createCommerceProviderEventMappings({
      integrationId: "adyen",
      successEventType: "payment.completed",
      failureEventType: "payment.failed",
    });
    const success = mappings[0]?.normalize({
      orgId: "org-1",
      integrationId: "adyen",
      connectionId: "connection-adyen",
      providerEventId: "adyen-success",
      eventType: "payment.completed",
      payload: {
        metadata: { machine_instance_id: instanceId },
        payment_reference: "adyen-payment-1",
        amount: 2500,
        currency: "cad",
      },
    });
    const failure = mappings[1]?.normalize({
      orgId: "org-1",
      integrationId: "adyen",
      connectionId: "connection-adyen",
      providerEventId: "adyen-failure",
      eventType: "payment.failed",
      payload: {
        metadata: { machine_instance_id: instanceId },
        status: "refused",
        currency: "cad",
      },
    });

    expect(success).toMatchObject({
      event: "PAYMENT_SUCCEEDED",
      machineInstanceId: instanceId,
      params: { paymentRef: "adyen-payment-1", amount: 2500, currency: "cad" },
    });
    expect(failure).toMatchObject({
      event: "PAYMENT_FAILED",
      machineInstanceId: instanceId,
      params: { reason: "refused", currency: "cad" },
    });
  });
});
