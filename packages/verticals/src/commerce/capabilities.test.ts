import { describe, expect, it, vi } from "vitest";
import {
  createCommerceCapabilities,
  createCommerceContribution,
  createCommerceMachineGuards,
  createCommerceProviderEventMappings,
  createStripeCheckoutAdapter,
} from "./capabilities";
import { PERMISSIONS } from "./types";

const instanceId = "00000000-0000-4000-8000-000000000001";

describe("commerce checkout capability", () => {
  it("derives the provider amount from the server catalog and starts guest payment", async () => {
    let cart = {
      id: instanceId,
      machineName: "cart",
      currentState: "active" as string,
      context: {
        guest: true,
        currency: "usd",
        items: [{ productId: "p1", quantity: 2, price: 1 }],
      },
      revision: 1,
      createdAt: new Date("2026-10-01T12:00:00Z"),
      updatedAt: new Date("2026-10-01T12:00:00Z"),
    };
    const transition = vi.fn(
      async (
        _orgId: string,
        _id: string,
        event: string,
        params: Record<string, unknown>,
        _expectedRevision?: number,
      ) => {
        cart = {
          ...cart,
          currentState: event === "checkout_reserving" ? "checkout_pending" : "awaiting_payment",
          context: { ...cart.context, ...params },
          revision: cart.revision + 1,
          updatedAt: new Date(),
        };
        return cart;
      },
    );
    const proxyMock = vi.fn(async () => ({ id: "cs_1", url: "https://checkout.test/cs_1" }));
    const proxy = proxyMock as unknown as <T = unknown>(input: unknown) => Promise<T>;
    const capabilities = createCommerceCapabilities({
      machines: {
        getInstance: async () => cart,
        transition,
      },
      integrations: { proxyProvider: proxy },
      catalog: {
        findByType: async () => [
          {
            data: { id: "p1", price: 12.5, currency: "USD", title: "Item One" },
            status: "published",
          },
        ],
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
    expect(transition).toHaveBeenCalledTimes(2);
    expect(transition).toHaveBeenNthCalledWith(
      1,
      "org-1",
      instanceId,
      "checkout_reserving",
      expect.objectContaining({
        checkoutProvider: "stripe",
        checkoutAmount: 2500,
        checkoutCurrency: "USD",
        orderRef: `order:${instanceId}`,
        checkoutOperationKey: `commerce-checkout:${instanceId}:1`,
        checkoutSnapshot: {
          schemaVersion: 1,
          currency: "USD",
          minorUnitExponent: 2,
          totalMinor: 2500,
          lines: [
            {
              productId: "p1",
              title: "Item One",
              quantity: 2,
              unitAmountMinor: 1250,
              lineAmountMinor: 2500,
            },
          ],
          capturedAt: expect.any(String),
        },
      }),
      1,
    );
    expect(transition).toHaveBeenNthCalledWith(
      2,
      "org-1",
      instanceId,
      "checkout_started",
      expect.objectContaining({
        checkoutId: "cs_1",
        checkoutUrl: "https://checkout.test/cs_1",
        checkoutProvider: "stripe",
      }),
      2,
    );
    const providerInput = (proxyMock.mock.calls[0] as unknown[])[0] as {
      headers?: Record<string, string>;
    };
    expect(providerInput.headers?.["Idempotency-Key"]).toBe(`commerce-checkout:${instanceId}:1`);
  });

  it("reserves once under concurrent capability keys before creating a provider session", async () => {
    let cart = {
      id: instanceId,
      machineName: "cart",
      currentState: "active" as string,
      context: { guest: true, currency: "CAD", items: [{ productId: "p1", quantity: 1 }] },
      revision: 1,
      createdAt: new Date("2026-10-01T12:00:00Z"),
      updatedAt: new Date("2026-10-01T12:00:00Z"),
    };
    let catalogCalls = 0;
    let releaseCatalog: (() => void) | undefined;
    const bothCatalogCalls = new Promise<void>((resolve) => {
      releaseCatalog = resolve;
    });
    const transitions: string[] = [];
    const transition = vi.fn(
      async (
        _orgId: string,
        _id: string,
        event: string,
        params: Record<string, unknown>,
        expectedRevision?: number,
      ) => {
        if (expectedRevision !== cart.revision) throw new Error("stale revision");
        transitions.push(event);
        cart = {
          ...cart,
          currentState: event === "checkout_reserving" ? "checkout_pending" : "awaiting_payment",
          context: { ...cart.context, ...params },
          revision: cart.revision + 1,
          updatedAt: new Date(),
        };
        return cart;
      },
    );
    const proxy = vi.fn(async () => ({
      id: "cs_concurrent",
      url: "https://checkout.test/cs_concurrent",
    }));
    const capabilities = createCommerceCapabilities({
      machines: {
        getInstance: async () => cart,
        transition,
      },
      integrations: {
        proxyProvider: proxy as unknown as <T = unknown>(input: unknown) => Promise<T>,
      },
      catalog: {
        findByType: async () => {
          catalogCalls += 1;
          if (catalogCalls === 2) releaseCatalog?.();
          await bothCatalogCalls;
          return [{ data: { id: "p1", price: 10, currency: "CAD" }, status: "published" }];
        },
      },
      checkoutProviders: { stripe: createStripeCheckoutAdapter() },
    });
    const command = capabilities["commerce.checkout"];
    const results = await Promise.allSettled([
      command(
        { instanceId, integrationId: "stripe" },
        { orgId: "org-1", requestId: "concurrent-a", idempotencyKey: "concurrent-a" },
      ),
      command(
        { instanceId, integrationId: "stripe" },
        { orgId: "org-1", requestId: "concurrent-b", idempotencyKey: "concurrent-b" },
      ),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(transitions).toEqual(["checkout_reserving", "checkout_started"]);
    expect(proxy).toHaveBeenCalledTimes(1);
  });

  it("binds signed-in checkout to the stored cart owner", async () => {
    const proxy = vi.fn(async () => ({ id: "cs_owned", url: "https://checkout.test/cs_owned" }));
    let cart = {
      id: instanceId,
      machineName: "cart",
      currentState: "active" as string,
      context: {
        ownerUserId: "account-1",
        guest: false,
        items: [{ productId: "p1", quantity: 1 }],
      },
      revision: 1,
      createdAt: new Date("2026-10-01T12:00:00Z"),
      updatedAt: new Date("2026-10-01T12:00:00Z"),
    };
    const transition = vi.fn(
      async (
        _orgId: string,
        _id: string,
        event: string,
        params: Record<string, unknown>,
        _expectedRevision?: number,
      ) => {
        cart = {
          ...cart,
          currentState: event === "checkout_reserving" ? "checkout_pending" : "awaiting_payment",
          context: { ...cart.context, ...params },
          revision: cart.revision + 1,
          updatedAt: new Date(),
        };
        return cart;
      },
    );
    const capabilities = createCommerceCapabilities({
      machines: {
        getInstance: async () => cart,
        transition,
      },
      integrations: {
        proxyProvider: proxy as unknown as <T = unknown>(input: unknown) => Promise<T>,
      },
      catalog: { findByType: async () => [{ data: { id: "p1", price: 12.5, currency: "USD" } }] },
      checkoutProviders: { stripe: createStripeCheckoutAdapter() },
    });
    const checkout = capabilities["commerce.checkout"];
    const input = { instanceId, integrationId: "stripe" };

    await expect(
      checkout(input, {
        orgId: "org-1",
        actorId: "account-2",
        requestId: "request-1",
        idempotencyKey: "attempt-1",
      }),
    ).rejects.toThrow("Cart is not owned by authenticated user");
    expect(proxy).not.toHaveBeenCalled();

    await expect(
      checkout(input, {
        orgId: "org-1",
        actorId: "account-1",
        requestId: "request-2",
        idempotencyKey: "attempt-2",
      }),
    ).resolves.toMatchObject({ externalCheckoutId: "cs_owned" });
    expect(proxy).toHaveBeenCalledTimes(1);
  });

  it("rejects client currency reinterpretation and mixed-currency carts", async () => {
    const proxy = vi.fn(async () => ({ id: "cs_bad", url: "https://checkout.test/cs_bad" }));
    const create = (items: Array<{ productId: string; quantity: number }>, products: unknown[]) =>
      createCommerceCapabilities({
        machines: {
          getInstance: async () => ({
            id: instanceId,
            machineName: "cart",
            currentState: "active",
            context: { guest: true, currency: "USD", items },
          }),
          transition: vi.fn(async () => undefined),
        },
        integrations: {
          proxyProvider: proxy as unknown as <T = unknown>(input: unknown) => Promise<T>,
        },
        catalog: { findByType: async () => products as Array<{ data: Record<string, unknown> }> },
        checkoutProviders: { stripe: createStripeCheckoutAdapter() },
      });
    const ctx = { orgId: "org-1", requestId: "req", idempotencyKey: "key" };

    await expect(
      create(
        [{ productId: "p1", quantity: 1 }],
        [{ data: { id: "p1", price: 2, currency: "CAD" }, status: "published" }],
      )["commerce.checkout"]({ instanceId, integrationId: "stripe" }, ctx),
    ).rejects.toThrow("Cart currency does not match trusted catalog pricing");
    await expect(
      create(
        [
          { productId: "p1", quantity: 1 },
          { productId: "p2", quantity: 1 },
        ],
        [
          { data: { id: "p1", price: 2, currency: "USD" }, status: "published" },
          { data: { id: "p2", price: 2, currency: "CAD" }, status: "published" },
        ],
      )["commerce.checkout"]({ instanceId, integrationId: "stripe" }, ctx),
    ).rejects.toThrow("A cart must contain products in one currency");
    expect(proxy).not.toHaveBeenCalled();
  });
});

describe("commerce order capabilities", () => {
  it("searches only currency-matched paid snapshots and returns fresh current state", async () => {
    const paid = {
      id: instanceId,
      machineName: "cart",
      currentState: "paid",
      context: {
        orderRef: `order:${instanceId}`,
        paymentRef: "pi_order",
        paidAt: "2026-10-01T18:00:00.000Z",
        checkoutCurrency: "USD",
        checkoutSnapshot: {
          currency: "USD",
          minorUnitExponent: 2,
          totalMinor: 1234,
          lines: [
            {
              productId: "p1",
              title: "Item",
              quantity: 1,
              unitAmountMinor: 1234,
              lineAmountMinor: 1234,
            },
          ],
        },
      },
      revision: 2,
      createdAt: new Date("2026-10-01T12:00:00Z"),
      updatedAt: new Date("2026-10-02T12:00:00Z"),
    };
    const searchInstances = vi.fn(async () => ({ items: [paid], nextCursor: "next-page" }));
    const capabilities = createCommerceCapabilities({
      machines: {
        getInstance: async () => paid,
        transition: vi.fn(async () => paid),
        searchInstances,
      },
      integrations: { proxyProvider: async <T>() => ({}) as T },
      checkoutProviders: { stripe: createStripeCheckoutAdapter() },
    });

    await expect(
      capabilities["commerce.orders.search"](
        {
          search: "order",
          status: "paid",
          currency: "usd",
          createdAfter: "2026-10-01T00:00:00.000Z",
          createdBefore: "2026-10-03T00:00:00.000Z",
          limit: 10,
        },
        { orgId: "org-1", requestId: "query-1", idempotencyKey: "query-1" },
      ),
    ).resolves.toEqual({
      items: [
        expect.objectContaining({
          id: instanceId,
          orderRef: `order:${instanceId}`,
          status: "paid",
          paymentStatus: "paid",
          fulfillmentStatus: "unfulfilled",
          amountMinor: 1234,
          currency: "USD",
          minorUnitExponent: 2,
          revision: 2,
          createdAt: "2026-10-01T18:00:00.000Z",
        }),
      ],
      nextCursor: "next-page",
    });
    expect(searchInstances).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        machineName: "cart",
        states: ["paid"],
        contextAnyOf: { checkoutCurrency: ["USD", "usd"] },
        searchContextFields: ["orderRef", "paymentRef"],
        contextDateField: "paidAt",
        contextDateAfter: new Date("2026-10-01T00:00:00.000Z"),
        contextDateBefore: new Date("2026-10-03T00:00:00.000Z"),
        limit: 10,
      }),
    );
  });

  it("uses revisioned XState commands and recovers a matching persisted command", async () => {
    let current = {
      id: instanceId,
      machineName: "cart",
      currentState: "paid" as string,
      context: {
        orderRef: `order:${instanceId}`,
        checkoutSnapshot: { currency: "CAD", minorUnitExponent: 2, totalMinor: 1000, lines: [] },
      },
      revision: 2,
      createdAt: new Date("2026-10-01T12:00:00Z"),
      updatedAt: new Date("2026-10-01T12:00:00Z"),
    };
    const transition = vi.fn(async (_orgId, _id, _event, _params, expectedRevision) => {
      expect(expectedRevision).toBe(2);
      current = { ...current, currentState: "cancelled", revision: 3 };
      return current;
    });
    const replayPersistedTransition = vi.fn(async () => true);
    const capabilities = createCommerceCapabilities({
      machines: {
        getInstance: async () => current,
        transition,
        searchInstances: async () => ({ items: [], nextCursor: null }),
        replayPersistedTransition,
      },
      integrations: { proxyProvider: async <T>() => ({}) as T },
      checkoutProviders: { stripe: createStripeCheckoutAdapter() },
    });
    const context = {
      orgId: "org-1",
      actorId: "staff-1",
      requestId: "command-1",
      idempotencyKey: "cancel-key",
    };

    await expect(
      capabilities["commerce.orders.cancel"](
        { orderId: instanceId, expectedRevision: 2, reason: "Customer request" },
        context,
      ),
    ).resolves.toMatchObject({ status: "cancelled", revision: 3 });
    expect(transition).toHaveBeenCalledWith(
      "org-1",
      instanceId,
      "CANCEL_ORDER",
      expect.objectContaining({
        actorId: "staff-1",
        reason: "Customer request",
        operationId: "cancel-key",
      }),
      2,
    );

    await expect(
      capabilities["commerce.orders.cancel"](
        { orderId: instanceId, expectedRevision: 2, reason: "Customer request" },
        context,
      ),
    ).resolves.toMatchObject({ status: "cancelled", revision: 3 });
    expect(replayPersistedTransition).toHaveBeenCalled();
    expect(transition).toHaveBeenCalledTimes(1);
  });

  it("returns immutable order and payment evidence through authorized order detail", async () => {
    const paid = {
      id: instanceId,
      machineName: "cart",
      currentState: "paid",
      context: {
        orderRef: `order:${instanceId}`,
        paymentRef: "pi_order",
        checkoutSnapshot: { currency: "CAD", minorUnitExponent: 2, totalMinor: 500, lines: [] },
      },
      revision: 2,
      createdAt: new Date("2026-10-01T12:00:00Z"),
      updatedAt: new Date("2026-10-01T12:30:00Z"),
    };
    const evidence = {
      appendRecord: vi.fn(async () => ({ id: "new-record", recordedAt: new Date() })),
      appendActivity: vi.fn(async () => ({ id: "new-activity", recordedAt: new Date() })),
      link: vi.fn(async () => ({ id: "new-link", createdAt: new Date() })),
      listRecords: vi.fn(async ({ subjectId }: { subjectId?: string }) => [
        {
          id: subjectId === "pi_order" ? "payment-record" : "order-record",
          type: subjectId === "pi_order" ? "commerce.payment.receipt" : "commerce.order.cancelled",
          subjectId: subjectId ?? "order:unknown",
          data: { reason: "Customer request" },
          recordedAt: new Date("2026-10-02T12:00:00Z"),
        },
      ]),
      listLinks: vi.fn(async () => [{ id: "link-1", relation: "caused_by" }]),
    };
    const capabilities = createCommerceCapabilities({
      machines: {
        getInstance: async () => paid,
        transition: vi.fn(async () => paid),
      },
      integrations: { proxyProvider: async <T>() => ({}) as T },
      checkoutProviders: { stripe: createStripeCheckoutAdapter() },
      evidence,
    });

    await expect(
      capabilities["commerce.orders.get"](
        { orderId: instanceId },
        { orgId: "org-1", requestId: "detail", idempotencyKey: "detail" },
      ),
    ).resolves.toMatchObject({
      detailCompleteness: "complete",
      evidenceRecords: [
        { id: "order-record", type: "commerce.order.cancelled" },
        { id: "payment-record", type: "commerce.payment.receipt" },
      ],
      evidenceLinks: [
        { recordId: "order-record", relation: "caused_by" },
        { recordId: "payment-record", relation: "caused_by" },
      ],
    });
  });

  it("registers separate read and manage capability policies on the existing handler map", () => {
    const contribution = createCommerceContribution({
      machines: {
        getInstance: async () => null,
        transition: vi.fn(async () => undefined),
        searchInstances: async () => ({ items: [], nextCursor: null }),
      },
      integrations: { proxyProvider: async <T>() => ({}) as T },
    });

    expect(contribution["commerce.orders.search"]).toMatchObject({
      kind: "query",
      permission: PERMISSIONS.COMMERCE_ORDERS_VIEW,
      extension: "commerce",
    });
    expect(contribution["commerce.orders.cancel"]).toMatchObject({
      kind: "command",
      permission: PERMISSIONS.COMMERCE_ORDERS_MANAGE,
      extension: "commerce",
      authorize: expect.any(Function),
    });
  });
});

describe("commerce payment transition guard", () => {
  it("requires provider amount and currency to match the reserved snapshot", () => {
    const guard = createCommerceMachineGuards()["commerce.payment.matches-checkout"];
    const instance = {
      context: {
        checkoutSnapshot: {
          schemaVersion: 1,
          currency: "CAD",
          minorUnitExponent: 2,
          totalMinor: 2500,
          lines: [],
          capturedAt: "2026-10-06T16:00:00.000Z",
        },
      },
    };

    expect(guard({ instance, params: { amount: 2500, currency: "cad" } }).passed).toBe(true);
    expect(guard({ instance, params: { amount: 2499, currency: "cad" } }).passed).toBe(false);
    expect(guard({ instance, params: { amount: 2500, currency: "usd" } }).passed).toBe(false);
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
      payload: {
        client_reference_id: instanceId,
        payment_intent: "pi_1",
        payment_status: "paid",
        metadata: {},
      },
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

    const unpaidCompleted = mappings[0]?.normalize({
      orgId: "org-1",
      integrationId: "stripe",
      connectionId: "connection-1",
      providerEventId: "evt-unpaid",
      eventType: "checkout.session.completed",
      payload: {
        client_reference_id: instanceId,
        payment_status: "unpaid",
        metadata: {},
      },
    });
    const delayedSuccess = mappings
      .find((mapping) => mapping.eventType === "checkout.session.async_payment_succeeded")
      ?.normalize({
        orgId: "org-1",
        integrationId: "stripe",
        connectionId: "connection-1",
        providerEventId: "evt-async-success",
        eventType: "checkout.session.async_payment_succeeded",
        payload: {
          client_reference_id: instanceId,
          payment_status: "paid",
          amount_total: 2500,
          currency: "cad",
          metadata: {},
        },
      });
    expect(unpaidCompleted).toBeNull();
    expect(delayedSuccess?.event).toBe("PAYMENT_SUCCEEDED");
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
