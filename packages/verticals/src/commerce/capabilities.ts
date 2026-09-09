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
        data: {
          mode: "payment",
          line_items: [{ price_data: { currency: request.currency, unit_amount: request.amount }, quantity: 1 }],
          metadata: request.metadata,
          success_url: request.metadata.successUrl,
          cancel_url: request.metadata.cancelUrl,
          client_reference_id: request.machineInstanceId,
        },
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

const checkoutInput = z.object({
  instanceId: z.string().uuid(),
  integrationId: z.string().min(1).max(100),
  amount: z.number().int().positive(),
  currency: z.string().length(3).transform((value) => value.toLowerCase()),
  successEvent: z.string().min(1).max(100).default("checkout"),
  failureEvent: z.string().min(1).max(100).default("checkout_failed"),
  metadata: z.record(z.string(), z.string().max(200)).default({}),
});

export function createCommerceCapabilities(deps: {
  machines: CommerceMachines;
  integrations: CommerceIntegrations;
  checkoutProviders: Record<string, CheckoutProviderAdapter>;
}): Record<string, CapabilityHandler> {
  return {
    "commerce.checkout": async (rawInput, context) => {
      const input = checkoutInput.parse(rawInput);
      const instance = await deps.machines.getInstance(context.orgId, input.instanceId);
      if (!instance || instance.machineName !== "cart") throw new Error("Cart not found");
      if (instance.currentState !== "active") throw new Error("Cart is not checkout-ready");

      const provider = deps.checkoutProviders[input.integrationId.trim().toLowerCase()];
      if (!provider) throw new Error("Checkout provider is not configured");
      const result = await provider.createSession(
        {
          orgId: context.orgId,
          integrationId: input.integrationId,
          amount: input.amount,
          currency: input.currency,
          machineInstanceId: instance.id,
          idempotencyKey: context.idempotencyKey,
          metadata: { ...input.metadata, machineInstanceId: instance.id },
        },
        deps.integrations.proxyProvider,
      );

      await deps.machines.transition(context.orgId, instance.id, input.successEvent, {
        checkoutId: result.externalCheckoutId,
        checkoutProvider: input.integrationId,
        checkoutAmount: input.amount,
        checkoutCurrency: input.currency,
      });
      return {
        provider: input.integrationId,
        externalCheckoutId: result.externalCheckoutId,
        redirectUrl: result.redirectUrl,
      };
    },
  };
}
