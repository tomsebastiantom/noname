import { z } from "zod";
import type { CapabilityHandler } from "./types";

type MachineInstance = {
  id: string;
  machineName: string;
  currentState: string;
};

type CommerceMachines = {
  getInstance(orgId: string, id: string): Promise<MachineInstance | null>;
  transition(orgId: string, id: string, event: string, params: Record<string, unknown>): Promise<unknown>;
};

type ProviderProxy = <T = unknown>(input: {
  orgId: string;
  integrationId: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  endpoint: string;
  data?: unknown;
  headers?: Record<string, string>;
}) => Promise<T>;

type CommerceIntegrations = {
  proxyProvider: ProviderProxy;
};

type CommerceCatalog = {
  findByType(orgId: string, type: string): Promise<Array<{ data: Record<string, unknown>; status?: string }>>;
};

export interface CheckoutSessionRequest {
  orgId: string;
  integrationId: string;
  amount: number;
  currency: string;
  machineInstanceId: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}

export interface CheckoutSessionResult {
  externalCheckoutId: string;
  redirectUrl: string;
}

export interface CheckoutProviderAdapter {
  createSession(
    request: CheckoutSessionRequest,
    proxy: ProviderProxy,
  ): Promise<CheckoutSessionResult>;
}

export function createStripeCheckoutAdapter(): CheckoutProviderAdapter {
  return {
    async createSession(request, proxy) {
      const result = await proxy<{ id?: string; url?: string }>({
        orgId: request.orgId,
        integrationId: request.integrationId,
        method: "POST",
        endpoint: "/v1/checkout/sessions",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        data: encodeStripeCheckoutForm(request),
      });
      if (!result.id || !result.url) throw new Error("Stripe returned an invalid checkout session");
      return { externalCheckoutId: result.id, redirectUrl: result.url };
    },
  };
}

export function createCheckoutProviderRegistry(
  adapters: Record<string, CheckoutProviderAdapter>,
): Record<string, CheckoutProviderAdapter> {
  return Object.fromEntries(
    Object.entries(adapters).map(([name, adapter]) => [name.trim().toLowerCase(), adapter]),
  );
}

type ProviderForwardedEvent = {
  orgId: string;
  integrationId: string;
  connectionId: string;
  providerEventId?: string;
  deliveryId?: string;
  eventType: string;
  payload: Record<string, unknown>;
};

export type CommerceContributionDeps = {
  machines: CommerceMachines;
  integrations: CommerceIntegrations;
  catalog?: CommerceCatalog;
};

export function createCommerceContribution(deps: CommerceContributionDeps) {
  return createCommerceCapabilities({
    ...deps,
    checkoutProviders: createCheckoutProviderRegistry({ stripe: createStripeCheckoutAdapter() }),
  });
}

export function createCommerceProviderEventMappings() {
  return [{
    integrationId: "stripe",
    eventType: "checkout.session.completed",
    normalize: (event: ProviderForwardedEvent) => {
      const payload = event.payload;
      const metadata = payload.metadata && typeof payload.metadata === "object"
        ? (payload.metadata as Record<string, unknown>)
        : {};
      const machineInstanceId = readString(metadata.machineInstanceId ?? payload.client_reference_id);
      if (!machineInstanceId) return null;
      return {
        event: "PAYMENT_SUCCEEDED",
        params: {
          paymentRef: readString(payload.payment_intent) ?? event.providerEventId,
          amount: payload.amount_total,
          currency: payload.currency,
        },
        machineInstanceId,
      };
    },
  }];
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function encodeStripeCheckoutForm(request: CheckoutSessionRequest): string {
  const values = new URLSearchParams({
    mode: "payment",
    success_url: request.metadata.successUrl ?? "",
    cancel_url: request.metadata.cancelUrl ?? "",
    client_reference_id: request.machineInstanceId,
  });
  values.set("line_items[0][price_data][currency]", request.currency);
  values.set("line_items[0][price_data][unit_amount]", String(request.amount));
  values.set("line_items[0][price_data][product_data][name]", "Order payment");
  values.set("line_items[0][quantity]", "1");
  values.set("metadata[machineEvent]", "PAYMENT_SUCCEEDED");
  for (const [key, value] of Object.entries(request.metadata)) {
    values.set(`metadata[${key}]`, value);
  }
  return values.toString();
}

const checkoutInput = z.object({
  instanceId: z.string().uuid(),
  integrationId: z.string().min(1).max(100),
  successEvent: z.string().min(1).max(100).default("checkout"),
  failureEvent: z.string().min(1).max(100).default("checkout_failed"),
  metadata: z.record(z.string(), z.string().max(200)).default({}),
});

export function createCommerceCapabilities(deps: {
  machines: CommerceMachines;
   integrations: CommerceIntegrations;
   catalog?: CommerceCatalog;
   checkoutProviders: Record<string, CheckoutProviderAdapter>;
}): Record<string, CapabilityHandler> {
  return {
    "commerce.checkout": async (rawInput, context) => {
      const input = checkoutInput.parse(rawInput);
      const instance = await deps.machines.getInstance(context.orgId, input.instanceId);
       if (instance?.machineName !== "cart") throw new Error("Cart not found");
       if (instance.currentState !== "active") throw new Error("Cart is not checkout-ready");
       const cartContext = (instance as MachineInstance & { context?: { items?: Array<{ quantity?: number; price?: number }>; total?: number; currency?: string } }).context ?? {};
        const items = Array.isArray(cartContext.items) ? cartContext.items : [];
        const products = deps.catalog ? await deps.catalog.findByType(context.orgId, "product") : [];
        const prices = new Map(products.map((product) => [String(product.data.productId ?? product.data.id ?? ""), Number(product.data.price)]));
        const amount = items.reduce((sum, item) => sum + (prices.get(String((item as { productId?: unknown }).productId)) ?? 0) * (item.quantity ?? 0) * 100, 0);
        if (items.length > 0 && amount <= 0) throw new Error("Cart prices are unavailable");
       const currency = cartContext.currency ?? "cad";
       if (!Number.isInteger(amount) || amount <= 0) throw new Error("Cart total is unavailable");

      const provider = deps.checkoutProviders[input.integrationId.trim().toLowerCase()];
      if (!provider) throw new Error("Checkout provider is not configured");
      const result = await provider.createSession(
        {
          orgId: context.orgId,
          integrationId: input.integrationId,
          amount,
          currency,
          machineInstanceId: instance.id,
          idempotencyKey: context.idempotencyKey,
          metadata: { ...input.metadata, machineInstanceId: instance.id },
        },
        deps.integrations.proxyProvider,
      );

      await deps.machines.transition(context.orgId, instance.id, "checkout", {
        checkoutId: result.externalCheckoutId,
        checkoutProvider: input.integrationId,
        checkoutAmount: amount,
        checkoutCurrency: currency,
      });
      return {
        provider: input.integrationId,
        externalCheckoutId: result.externalCheckoutId,
        redirectUrl: result.redirectUrl,
      };
    },
  };
}
