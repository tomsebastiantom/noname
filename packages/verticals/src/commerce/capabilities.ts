import { z } from "zod";
import {
  currencyExponent,
  DEFAULT_CHECKOUT_CURRENCIES,
  normalizeCurrency,
  toMinorUnits,
} from "./money";
import type { CommerceEvidencePort } from "./order-projection";
import {
  type CapabilityContext,
  type CapabilityHandler,
  capabilityDescriptor,
  PERMISSIONS,
} from "./types";

type MachineInstance = {
  id: string;
  machineName: string;
  currentState: string;
  context?: Record<string, unknown>;
  revision?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

type MachineSearchQuery = {
  machineName?: string;
  states?: string[];
  contextEquals?: Record<string, string | number | boolean>;
  contextAnyOf?: Record<string, Array<string | number | boolean>>;
  contextExists?: string[];
  search?: string;
  searchContextFields?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  contextDateField?: string;
  contextDateAfter?: Date;
  contextDateBefore?: Date;
  cursor?: string;
  limit?: number;
};

type CommerceMachines = {
  getInstance(orgId: string, id: string): Promise<MachineInstance | null>;
  transition(
    orgId: string,
    id: string,
    event: string,
    params: Record<string, unknown>,
    expectedRevision?: number,
  ): Promise<MachineInstance | unknown>;
  searchInstances?(
    orgId: string,
    query: MachineSearchQuery,
  ): Promise<{ items: MachineInstance[]; nextCursor: string | null }>;
  replayPersistedTransition?(
    orgId: string,
    id: string,
    event: string,
    expectedParams: Record<string, unknown>,
    expectedFinalState: string,
    expectedFromState?: string,
  ): Promise<boolean>;
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
  findByType(
    orgId: string,
    type: string,
  ): Promise<Array<{ data: Record<string, unknown>; status?: string }>>;
};

type CheckoutSnapshot = {
  schemaVersion: 1;
  currency: string;
  minorUnitExponent: number;
  totalMinor: number;
  lines: Array<Record<string, unknown>>;
  capturedAt: string;
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
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": request.idempotencyKey,
        },
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
  evidence?: CommerceEvidencePort;
};

export function createCommerceContribution(deps: CommerceContributionDeps) {
  const handlers = createCommerceCapabilities({
    ...deps,
    checkoutProviders: createCheckoutProviderRegistry({ stripe: createStripeCheckoutAdapter() }),
    supportedCurrencies: DEFAULT_CHECKOUT_CURRENCIES,
  });
  const authorizeOrder = async (rawInput: unknown, context: CapabilityContext) => {
    const parsed = orderDetailInput.safeParse(rawInput);
    if (!parsed.success) return false;
    const instance = await deps.machines.getInstance(context.orgId, parsed.data.orderId);
    return Boolean(instance && isOrderInstance(instance));
  };
  const authorizeCheckout = async (rawInput: unknown, context: CapabilityContext) => {
    const parsed = checkoutInput.safeParse(rawInput);
    if (!parsed.success) return false;
    const instance = await deps.machines.getInstance(context.orgId, parsed.data.instanceId);
    if (instance?.machineName !== "cart") return false;
    const ownerUserId = readString(instance.context?.ownerUserId);
    return context.actorId
      ? ownerUserId === context.actorId
      : !ownerUserId && instance.context?.guest === true;
  };
  const extension = "commerce";
  return {
    "commerce.checkout": capabilityDescriptor(
      handlers["commerce.checkout"]!,
      "command",
      PERMISSIONS.STOREFRONT_VIEW,
      { extension, publicAccess: "publishable-key", authorize: authorizeCheckout },
    ),
    "commerce.orders.search": capabilityDescriptor(
      handlers["commerce.orders.search"]!,
      "query",
      PERMISSIONS.COMMERCE_ORDERS_VIEW,
      { extension },
    ),
    "commerce.orders.get": capabilityDescriptor(
      handlers["commerce.orders.get"]!,
      "query",
      PERMISSIONS.COMMERCE_ORDERS_VIEW,
      { extension, authorize: authorizeOrder },
    ),
    "commerce.orders.cancel": capabilityDescriptor(
      handlers["commerce.orders.cancel"]!,
      "command",
      PERMISSIONS.COMMERCE_ORDERS_MANAGE,
      { extension, authorize: authorizeOrder },
    ),
    "commerce.orders.fulfill": capabilityDescriptor(
      handlers["commerce.orders.fulfill"]!,
      "command",
      PERMISSIONS.COMMERCE_ORDERS_MANAGE,
      { extension, authorize: authorizeOrder },
    ),
    "commerce.orders.refund": capabilityDescriptor(
      handlers["commerce.orders.refund"]!,
      "command",
      PERMISSIONS.COMMERCE_ORDERS_MANAGE,
      { extension, authorize: authorizeOrder },
    ),
  };
}

export type CommerceProviderMappingOptions = {
  integrationId: string;
  successEventType: string;
  asyncSuccessEventType?: string;
  failureEventType: string;
  expiredEventType?: string;
  requirePaidStatus?: boolean;
};

export function createCommerceProviderEventMappings(
  options: CommerceProviderMappingOptions = {
    integrationId: "stripe",
    successEventType: "checkout.session.completed",
    asyncSuccessEventType: "checkout.session.async_payment_succeeded",
    failureEventType: "checkout.session.async_payment_failed",
    expiredEventType: "checkout.session.expired",
    requirePaidStatus: true,
  },
) {
  const requirePaidStatus =
    options.requirePaidStatus ?? options.integrationId.toLowerCase() === "stripe";
  const normalizePaymentEvent = (
    event: ProviderForwardedEvent,
    normalizedEvent: "PAYMENT_SUCCEEDED" | "PAYMENT_FAILED",
  ) => {
    const payload = event.payload;
    if (
      normalizedEvent === "PAYMENT_SUCCEEDED" &&
      requirePaidStatus &&
      readString(payload.payment_status)?.toLowerCase() !== "paid"
    ) {
      return null;
    }
    const metadata =
      payload.metadata && typeof payload.metadata === "object"
        ? (payload.metadata as Record<string, unknown>)
        : {};
    const machineInstanceId = readString(
      metadata.machineInstanceId ?? metadata.machine_instance_id ?? payload.client_reference_id,
    );
    if (!machineInstanceId) return null;
    return {
      event: normalizedEvent,
      params: {
        paymentRef:
          readString(payload.payment_intent ?? payload.payment_reference) ?? event.providerEventId,
        amount: payload.amount_total ?? payload.amount,
        currency: payload.currency,
        paidAt: normalizedEvent === "PAYMENT_SUCCEEDED" ? new Date().toISOString() : undefined,
        reason:
          normalizedEvent === "PAYMENT_FAILED"
            ? (readString(payload.payment_status ?? payload.status) ?? event.eventType)
            : undefined,
      },
      machineInstanceId,
    };
  };

  const mappings = [
    {
      integrationId: options.integrationId,
      eventType: options.successEventType,
      normalize: (event: ProviderForwardedEvent) =>
        normalizePaymentEvent(event, "PAYMENT_SUCCEEDED"),
    },
    {
      integrationId: options.integrationId,
      eventType: options.failureEventType,
      normalize: (event: ProviderForwardedEvent) => normalizePaymentEvent(event, "PAYMENT_FAILED"),
    },
  ];
  if (options.asyncSuccessEventType) {
    mappings.push({
      integrationId: options.integrationId,
      eventType: options.asyncSuccessEventType,
      normalize: (event: ProviderForwardedEvent) =>
        normalizePaymentEvent(event, "PAYMENT_SUCCEEDED"),
    });
  }
  if (options.expiredEventType) {
    mappings.push({
      integrationId: options.integrationId,
      eventType: options.expiredEventType,
      normalize: (event: ProviderForwardedEvent) => normalizePaymentEvent(event, "PAYMENT_FAILED"),
    });
  }
  return mappings;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

async function buildCheckoutSnapshot(
  catalog: CommerceCatalog | undefined,
  orgId: string,
  cartContext: Record<string, unknown>,
  supportedCurrencies: readonly string[],
): Promise<CheckoutSnapshot> {
  const items = Array.isArray(cartContext.items) ? cartContext.items : [];
  if (items.length === 0) throw new Error("Cart is empty");
  const products = catalog ? await catalog.findByType(orgId, "product") : [];
  const publishedProducts = products.filter(
    (product) => product.status === undefined || product.status === "published",
  );
  const productById = new Map(
    publishedProducts.map((product) => [
      String(product.data.productId ?? product.data.id ?? ""),
      product.data,
    ]),
  );
  const enabledCurrencies = new Set(supportedCurrencies.map(normalizeCurrency));
  const lines = items.map((rawItem) => {
    const item = rawItem as { productId?: unknown; quantity?: unknown };
    const productId = typeof item.productId === "string" ? item.productId.trim() : "";
    const quantity = item.quantity;
    if (
      !productId ||
      !Number.isInteger(quantity) ||
      Number(quantity) < 1 ||
      Number(quantity) > 999
    ) {
      throw new Error("Cart contains an invalid line item");
    }
    const product = productById.get(productId);
    if (!product) throw new Error(`Product is unavailable: ${productId}`);
    const currency = normalizeCurrency(
      typeof product.currency === "string" ? product.currency : "CAD",
    );
    if (!enabledCurrencies.has(currency)) throw new Error(`Currency ${currency} is not enabled`);
    const unitAmountMinor = toMinorUnits(Number(product.price), currency);
    if (unitAmountMinor <= 0) throw new Error(`Product price is unavailable: ${productId}`);
    const lineAmountMinor = unitAmountMinor * Number(quantity);
    if (!Number.isSafeInteger(lineAmountMinor)) throw new Error("Order amount exceeds safe limits");
    return {
      productId,
      title: typeof product.title === "string" ? product.title : productId,
      quantity: Number(quantity),
      unitAmountMinor,
      lineAmountMinor,
      currency,
    };
  });
  const currency = lines[0]?.currency;
  if (!currency || lines.some((line) => line.currency !== currency)) {
    throw new Error("A cart must contain products in one currency");
  }
  if (
    typeof cartContext.currency === "string" &&
    normalizeCurrency(cartContext.currency) !== currency
  ) {
    throw new Error("Cart currency does not match trusted catalog pricing");
  }
  const totalMinor = lines.reduce((sum, line) => sum + line.lineAmountMinor, 0);
  if (!Number.isSafeInteger(totalMinor) || totalMinor <= 0) {
    throw new Error("Cart total is unavailable");
  }
  return {
    schemaVersion: 1,
    currency,
    minorUnitExponent: currencyExponent(currency),
    totalMinor,
    lines: lines.map(({ currency: _currency, ...line }) => line),
    capturedAt: new Date().toISOString(),
  };
}

function readOrderSnapshot(value: unknown): CheckoutSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  const normalizedCurrency =
    typeof snapshot.currency === "string" ? normalizeCurrency(snapshot.currency) : null;
  if (
    snapshot.schemaVersion !== 1 ||
    !normalizedCurrency ||
    !Number.isInteger(snapshot.minorUnitExponent) ||
    !Number.isSafeInteger(snapshot.totalMinor) ||
    !Array.isArray(snapshot.lines) ||
    typeof snapshot.capturedAt !== "string"
  ) {
    return null;
  }
  return {
    schemaVersion: 1,
    currency: normalizedCurrency,
    minorUnitExponent: Number(snapshot.minorUnitExponent),
    totalMinor: Number(snapshot.totalMinor),
    lines: snapshot.lines.filter(
      (line): line is Record<string, unknown> =>
        Boolean(line) && typeof line === "object" && !Array.isArray(line),
    ),
    capturedAt: snapshot.capturedAt,
  };
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

const orderStates = ["paid", "cancelled", "fulfilled"] as const;
const orderSearchInput = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(orderStates).optional(),
  currency: z
    .string()
    .regex(/^[A-Za-z]{3}$/)
    .optional(),
  createdAfter: z.string().datetime().optional(),
  createdBefore: z.string().datetime().optional(),
  cursor: z.string().max(512).optional(),
  limit: z.number().int().min(1).max(50).default(25),
});
const orderDetailInput = z.object({ orderId: z.string().uuid() });
const cancelOrderInput = z.object({
  orderId: z.string().uuid(),
  expectedRevision: z.number().int().min(1),
  reason: z.string().trim().min(3).max(500),
});
const fulfillOrderInput = z.object({
  orderId: z.string().uuid(),
  expectedRevision: z.number().int().min(1),
  fulfillmentReference: z.string().trim().max(200).optional(),
  carrier: z.string().trim().max(100).optional(),
  trackingNumber: z.string().trim().max(200).optional(),
});
const refundOrderInput = z.object({
  orderId: z.string().uuid(),
  expectedRevision: z.number().int().min(1),
  amountMinor: z.number().int().min(0).optional(),
  reason: z.string().trim().max(500).optional(),
});

type OrderSnapshot = {
  currency: string;
  minorUnitExponent: number;
  totalMinor: number;
  lines: Array<Record<string, unknown>>;
  capturedAt?: string;
};

function orderSnapshot(instance: MachineInstance): OrderSnapshot | null {
  const value = instance.context?.checkoutSnapshot;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Record<string, unknown>;
  if (
    typeof snapshot.currency !== "string" ||
    !Number.isInteger(snapshot.minorUnitExponent) ||
    !Number.isSafeInteger(snapshot.totalMinor) ||
    !Array.isArray(snapshot.lines)
  ) {
    return null;
  }
  return {
    currency: snapshot.currency,
    minorUnitExponent: Number(snapshot.minorUnitExponent),
    totalMinor: Number(snapshot.totalMinor),
    lines: snapshot.lines.filter(
      (line): line is Record<string, unknown> =>
        Boolean(line) && typeof line === "object" && !Array.isArray(line),
    ),
    capturedAt: typeof snapshot.capturedAt === "string" ? snapshot.capturedAt : undefined,
  };
}

export function createCommerceMachineGuards() {
  return {
    "commerce.payment.matches-checkout": ({
      instance,
      params,
    }: {
      instance: { context: Record<string, unknown> };
      params: Record<string, unknown>;
    }) => {
      const context = instance.context;
      const rawSnapshot = context.checkoutSnapshot;
      const snapshot = readOrderSnapshot(rawSnapshot);
      const malformedSnapshot = rawSnapshot !== undefined && snapshot === null;
      let expectedCurrency: string | undefined = snapshot?.currency;
      if (!expectedCurrency && typeof context.checkoutCurrency === "string") {
        try {
          expectedCurrency = normalizeCurrency(context.checkoutCurrency);
        } catch {
          return {
            passed: false,
            name: "commerce.payment.matches-checkout",
            reason: "invalid stored currency",
          };
        }
      }
      const expectedAmount = snapshot?.totalMinor ?? context.checkoutAmount;
      const actualAmount = params.amount;
      const actualCurrency = params.currency;
      const amountMatches =
        expectedAmount === undefined ||
        (typeof expectedAmount === "number" &&
          Number.isSafeInteger(expectedAmount) &&
          typeof actualAmount === "number" &&
          Number.isSafeInteger(actualAmount) &&
          actualAmount === expectedAmount);
      let currencyMatches = expectedCurrency === undefined;
      if (expectedCurrency !== undefined) {
        try {
          currencyMatches =
            typeof actualCurrency === "string" &&
            normalizeCurrency(actualCurrency) === expectedCurrency;
        } catch {
          currencyMatches = false;
        }
      }
      const passed = !malformedSnapshot && amountMatches && currencyMatches;
      return {
        passed,
        name: "commerce.payment.matches-checkout",
        reason: passed
          ? undefined
          : "provider amount/currency does not match the reserved checkout snapshot",
      };
    },
  };
}

function isOrderInstance(instance: MachineInstance): boolean {
  const context = instance.context ?? {};
  const hasLegacyPaymentFact =
    Number.isSafeInteger(context.checkoutAmount) || typeof context.paymentRef === "string";
  return (
    instance.machineName === "cart" &&
    (orderStates as readonly string[]).includes(instance.currentState) &&
    (orderSnapshot(instance) !== null || hasLegacyPaymentFact)
  );
}

function toOrderSummary(instance: MachineInstance) {
  const context = instance.context ?? {};
  const snapshot = orderSnapshot(instance);
  let currency = snapshot?.currency ?? "CAD";
  if (!snapshot) {
    try {
      currency = normalizeCurrency(readString(context.checkoutCurrency) ?? "CAD");
    } catch {
      currency = "CAD";
    }
  }
  const amountFromLegacy = Number.isSafeInteger(context.checkoutAmount)
    ? Number(context.checkoutAmount)
    : null;
  return {
    id: instance.id,
    orderRef: readString(context.orderRef) ?? `order:${instance.id}`,
    status: instance.currentState,
    paymentStatus: "paid",
    fulfillmentStatus: instance.currentState === "fulfilled" ? "fulfilled" : "unfulfilled",
    paymentRef: readString(context.paymentRef) ?? null,
    amountMinor: snapshot?.totalMinor ?? amountFromLegacy,
    currency,
    minorUnitExponent: snapshot?.minorUnitExponent ?? currencyExponent(currency),
    lineItems: snapshot?.lines ?? [],
    detailCompleteness: snapshot ? "complete" : "partial",
    createdAt: readDate(context.paidAt)?.toISOString() ?? instance.createdAt?.toISOString() ?? null,
    updatedAt: instance.updatedAt?.toISOString() ?? null,
    revision: instance.revision ?? 1,
  };
}

async function changeOrderState(
  machines: CommerceMachines,
  context: CapabilityContext,
  orderId: string,
  expectedRevision: number,
  event: "CANCEL_ORDER" | "MARK_FULFILLED" | "REFUND_ORDER",
  params: Record<string, unknown>,
) {
  const instance = await machines.getInstance(context.orgId, orderId);
  if (!instance || !isOrderInstance(instance)) throw new Error("Order not found");
  const targetState = event === "CANCEL_ORDER" ? "cancelled" : event === "MARK_FULFILLED" ? "fulfilled" : "refund_pending";
  if (instance.currentState === targetState && machines.replayPersistedTransition) {
    const replayed = await machines.replayPersistedTransition(
      context.orgId,
      orderId,
      event,
      params,
      targetState,
      "paid",
    );
    if (replayed) {
      const replayedInstance = await machines.getInstance(context.orgId, orderId);
      if (replayedInstance && isOrderInstance(replayedInstance))
        return toOrderSummary(replayedInstance);
    }
  }
  const changed = await machines.transition(
    context.orgId,
    orderId,
    event,
    params,
    expectedRevision,
  );
  const updated = await machines.getInstance(context.orgId, orderId);
  if (updated && isOrderInstance(updated)) return toOrderSummary(updated);
  if (changed && typeof changed === "object" && "currentState" in changed) {
    return toOrderSummary(changed as MachineInstance);
  }
  throw new Error("Order transition result is unavailable");
}

export function createCommerceCapabilities(deps: {
  machines: CommerceMachines;
  integrations: CommerceIntegrations;
  catalog?: CommerceCatalog;
  checkoutProviders: Record<string, CheckoutProviderAdapter>;
  supportedCurrencies?: readonly string[];
  evidence?: CommerceEvidencePort;
}): Record<string, CapabilityHandler> {
  return {
    "commerce.checkout": async (rawInput, context) => {
      const input = checkoutInput.parse(rawInput);
      const instance = await deps.machines.getInstance(context.orgId, input.instanceId);
      if (instance?.machineName !== "cart") throw new Error("Cart not found");
      const cartContext = instance.context ?? {};
      const ownerUserId =
        typeof cartContext.ownerUserId === "string" ? cartContext.ownerUserId : undefined;
      if (context.actorId) {
        if (ownerUserId !== context.actorId)
          throw new Error("Cart is not owned by authenticated user");
      } else if (ownerUserId || cartContext.guest !== true) {
        throw new Error("Guest checkout requires an unowned guest cart");
      }
      if (instance.currentState === "awaiting_payment") {
        const checkoutId = readString(cartContext.checkoutId);
        const redirectUrl = readString(cartContext.checkoutUrl);
        if (checkoutId && redirectUrl) {
          return {
            provider: readString(cartContext.checkoutProvider) ?? input.integrationId,
            externalCheckoutId: checkoutId,
            redirectUrl,
          };
        }
        throw new Error("Checkout session is already being prepared; retry shortly");
      }
      if (instance.currentState !== "active" && instance.currentState !== "checkout_pending") {
        throw new Error("Cart is not checkout-ready");
      }
      let checkoutSnapshot: CheckoutSnapshot;
      let pendingInstance = instance;
      const providerName = input.integrationId.trim().toLowerCase();
      const provider = deps.checkoutProviders[providerName];
      if (!provider) throw new Error("Checkout provider is not configured");
      if (instance.currentState === "active") {
        checkoutSnapshot = await buildCheckoutSnapshot(
          deps.catalog,
          context.orgId,
          cartContext,
          deps.supportedCurrencies ?? DEFAULT_CHECKOUT_CURRENCIES,
        );
        const orderRef = `order:${instance.id}`;
        const operationKey = `commerce-checkout:${instance.id}:${instance.revision ?? 1}`;
        await deps.machines.transition(
          context.orgId,
          instance.id,
          "checkout_reserving",
          {
            checkoutProvider: providerName,
            checkoutOperationKey: operationKey,
            checkoutAmount: checkoutSnapshot.totalMinor,
            checkoutCurrency: checkoutSnapshot.currency,
            orderRef,
            checkoutSnapshot,
          },
          instance.revision,
        );
        const reserved = await deps.machines.getInstance(context.orgId, instance.id);
        if (reserved?.currentState !== "checkout_pending") {
          throw new Error("Cart checkout reservation could not be confirmed");
        }
        pendingInstance = reserved;
      } else {
        if (readString(cartContext.checkoutProvider) !== providerName) {
          throw new Error("Cart checkout is reserved with a different provider");
        }
        const storedSnapshot = readOrderSnapshot(cartContext.checkoutSnapshot);
        if (!storedSnapshot) throw new Error("Reserved checkout snapshot is unavailable");
        checkoutSnapshot = storedSnapshot;
      }

      const orderRef = readString(pendingInstance.context?.orderRef) ?? `order:${instance.id}`;
      const operationKey = readString(pendingInstance.context?.checkoutOperationKey);
      if (!operationKey) throw new Error("Checkout operation key is unavailable");
      const result = await provider.createSession(
        {
          orgId: context.orgId,
          integrationId: providerName,
          amount: checkoutSnapshot.totalMinor,
          currency: checkoutSnapshot.currency.toLowerCase(),
          machineInstanceId: instance.id,
          idempotencyKey: operationKey,
          metadata: { ...input.metadata, machineInstanceId: instance.id, orderRef },
        },
        deps.integrations.proxyProvider,
      );

      await deps.machines.transition(
        context.orgId,
        instance.id,
        "checkout_started",
        {
          checkoutId: result.externalCheckoutId,
          checkoutUrl: result.redirectUrl,
          checkoutProvider: providerName,
        },
        pendingInstance.revision,
      );
      return {
        provider: providerName,
        externalCheckoutId: result.externalCheckoutId,
        redirectUrl: result.redirectUrl,
      };
    },
    "commerce.orders.search": async (rawInput, context) => {
      const input = orderSearchInput.parse(rawInput);
      if (!deps.machines.searchInstances) throw new Error("Order search is unavailable");
      if (input.createdAfter && input.createdBefore && input.createdAfter > input.createdBefore) {
        throw new Error("createdAfter must be earlier than createdBefore");
      }
      const currency = input.currency ? normalizeCurrency(input.currency) : undefined;
      const page = await deps.machines.searchInstances(context.orgId, {
        machineName: "cart",
        states: input.status ? [input.status] : ["paid", "cancelled", "fulfilled"],
        contextAnyOf: currency
          ? { checkoutCurrency: [currency, currency.toLowerCase()] }
          : undefined,
        search: input.search,
        searchContextFields: ["orderRef", "paymentRef"],
        contextDateField: "paidAt",
        contextDateAfter: input.createdAfter ? new Date(input.createdAfter) : undefined,
        contextDateBefore: input.createdBefore ? new Date(input.createdBefore) : undefined,
        cursor: input.cursor,
        limit: input.limit,
      });
      return {
        items: page.items.filter(isOrderInstance).map(toOrderSummary),
        nextCursor: page.nextCursor,
      };
    },
    "commerce.orders.get": async (rawInput, context) => {
      const input = orderDetailInput.parse(rawInput);
      const instance = await deps.machines.getInstance(context.orgId, input.orderId);
      if (!instance || !isOrderInstance(instance)) throw new Error("Order not found");
      const order = toOrderSummary(instance);
      if (!deps.evidence?.listRecords) return { ...order, evidenceRecords: [], evidenceLinks: [] };
      const orderRef = order.orderRef;
      const paymentRef = order.paymentRef;
      const [orderRecords, paymentRecords] = await Promise.all([
        deps.evidence.listRecords({
          orgId: context.orgId,
          subjectType: "commerce.order",
          subjectId: orderRef,
          limit: 20,
        }),
        paymentRef
          ? deps.evidence.listRecords({
              orgId: context.orgId,
              subjectType: "commerce.payment",
              subjectId: paymentRef,
              limit: 10,
            })
          : Promise.resolve([]),
      ]);
      const evidenceRecords = [...orderRecords, ...paymentRecords].sort(
        (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
      );
      const evidenceLinks = deps.evidence.listLinks
        ? (
            await Promise.all(
              evidenceRecords.map(
                async (record) =>
                  (
                    await deps.evidence?.listLinks?.(context.orgId, record.id)
                  )?.map((link) => ({
                    recordId: record.id,
                    ...link,
                  })) ?? [],
              ),
            )
          ).flat()
        : [];
      return {
        ...order,
        evidenceRecords: evidenceRecords.map((record) => ({
          id: record.id,
          type: record.type,
          subjectId: record.subjectId,
          data: record.data,
          recordedAt: record.recordedAt.toISOString(),
        })),
        evidenceLinks,
      };
    },
    "commerce.orders.cancel": async (rawInput, context) => {
      const input = cancelOrderInput.parse(rawInput);
      return changeOrderState(
        deps.machines,
        context,
        input.orderId,
        input.expectedRevision,
        "CANCEL_ORDER",
        {
          actorId: context.actorId,
          reason: input.reason,
          operationId: context.idempotencyKey,
        },
      );
    },
    "commerce.orders.fulfill": async (rawInput, context) => {
      const input = fulfillOrderInput.parse(rawInput);
      return changeOrderState(
        deps.machines,
        context,
        input.orderId,
        input.expectedRevision,
        "MARK_FULFILLED",
        {
          actorId: context.actorId,
          fulfillmentReference: input.fulfillmentReference,
          carrier: input.carrier,
          trackingNumber: input.trackingNumber,
          operationId: context.idempotencyKey,
        },
      );
    },
    "commerce.orders.refund": async (rawInput, context) => {
      const input = refundOrderInput.parse(rawInput);
      return changeOrderState(
        deps.machines,
        context,
        input.orderId,
        input.expectedRevision,
        "REFUND_ORDER",
        {
          actorId: context.actorId,
          amountMinor: input.amountMinor,
          reason: input.reason,
          operationId: context.idempotencyKey,
        },
      );
    },
  };
}
