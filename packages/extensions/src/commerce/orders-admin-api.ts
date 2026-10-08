export type CommerceOrderStatus = "paid" | "cancelled" | "fulfilled" | "refunded" | "refund_pending";

export type CommerceOrderSearchInput = {
  search?: string;
  status?: CommerceOrderStatus;
  currency?: string;
  createdAfter?: string;
  createdBefore?: string;
  cursor?: string;
  limit?: number;
};

export type CommerceOrderLineItem = Record<string, unknown>;

export type CommerceOrderSummary = {
  id: string;
  orderRef: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  paymentRef: string | null;
  amountMinor: number | null;
  currency: string;
  minorUnitExponent: number;
  lineItems: CommerceOrderLineItem[];
  detailCompleteness?: "complete" | "partial";
  createdAt: string | null;
  updatedAt: string | null;
  revision: number;
};

export type CommerceOrder = CommerceOrderSummary & {
  evidenceRecords: unknown[];
  evidenceLinks: unknown[];
};

export type CommerceOrderPage = {
  items: CommerceOrderSummary[];
  nextCursor: string | null;
};

export type CancelCommerceOrderInput = {
  orderId: string;
  expectedRevision: number;
  reason: string;
};

export type RefundCommerceOrderInput = {
  orderId: string;
  expectedRevision: number;
  amountMinor?: number;
  reason?: string;
};

export type FulfillCommerceOrderInput = {
  orderId: string;
  expectedRevision: number;
  fulfillmentReference?: string;
  carrier?: string;
  trackingNumber?: string;
};

export class CommerceOrdersPermissionError extends Error {
  constructor() {
    super("Orders require the commerce orders view or manage permission.");
    this.name = "CommerceOrdersPermissionError";
  }
}

export class CommerceOrdersHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CommerceOrdersHttpError";
  }
}

type CapabilityResponse<T> = { data: T };

export async function fetchCommerceOrders(
  input: CommerceOrderSearchInput = {},
): Promise<CommerceOrderPage> {
  const page = await callCommerceCapability<CommerceOrderPage>("commerce.orders.search", input);
  return {
    ...page,
    items: Array.isArray(page.items) ? page.items.map(normalizeOrderSummary) : [],
  };
}

export async function fetchCommerceOrder(orderId: string): Promise<CommerceOrder> {
  const order = await callCommerceCapability<CommerceOrder>("commerce.orders.get", { orderId });
  return {
    ...normalizeOrderSummary(order),
    evidenceRecords: Array.isArray(order.evidenceRecords) ? order.evidenceRecords : [],
    evidenceLinks: Array.isArray(order.evidenceLinks) ? order.evidenceLinks : [],
  };
}

function normalizeOrderSummary(order: CommerceOrderSummary): CommerceOrderSummary {
  return {
    ...order,
    amountMinor: typeof order.amountMinor === "number" ? order.amountMinor : null,
    lineItems: Array.isArray(order.lineItems) ? order.lineItems : [],
  };
}

export async function cancelCommerceOrder(
  input: CancelCommerceOrderInput,
): Promise<CommerceOrderSummary> {
  const order = await callCommerceCapability<CommerceOrderSummary>(
    "commerce.orders.cancel",
    input,
    true,
  );
  return normalizeOrderSummary(order);
}

export async function fulfillCommerceOrder(
  input: FulfillCommerceOrderInput,
): Promise<CommerceOrderSummary> {
  const order = await callCommerceCapability<CommerceOrderSummary>(
    "commerce.orders.fulfill",
    input,
    true,
  );
  return normalizeOrderSummary(order);
}

export async function refundCommerceOrder(
  input: RefundCommerceOrderInput,
): Promise<CommerceOrderSummary> {
  const order = await callCommerceCapability<CommerceOrderSummary>(
    "commerce.orders.refund",
    input,
    true,
  );
  return normalizeOrderSummary(order);
}

async function callCommerceCapability<T>(
  capability: string,
  input: unknown,
  command = false,
): Promise<T> {
  const token =
    typeof sessionStorage === "undefined" ? null : sessionStorage.getItem("noname:access_token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (command) headers["Idempotency-Key"] = createIdempotencyKey();

  const response = await fetch(`/api/capabilities/${capability}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
  });
  if (response.status === 401 || response.status === 403) {
    throw new CommerceOrdersPermissionError();
  }
  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new CommerceOrdersHttpError(
      response.status,
      message ?? `Orders request failed (${response.status})`,
    );
  }

  const body = (await response.json()) as CapabilityResponse<T>;
  if (!body || typeof body !== "object" || !("data" in body)) {
    throw new Error("Orders response was invalid");
  }
  return body.data;
}

function createIdempotencyKey(): string {
  if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") {
    throw new Error("Secure command idempotency is unavailable in this browser");
  }
  return crypto.randomUUID();
}

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as {
      error?: string | { message?: string };
      message?: string;
    };
    if (typeof body.error === "string") return body.error;
    if (body.error && typeof body.error.message === "string") return body.error.message;
    if (typeof body.message === "string") return body.message;
  } catch {
    // Use the status fallback when the server did not return JSON.
  }
  return null;
}

export function isCommerceOrdersPermissionError(error: unknown): boolean {
  return error instanceof CommerceOrdersPermissionError;
}

export function isCommerceOrdersConflictError(error: unknown): boolean {
  return error instanceof CommerceOrdersHttpError && error.status === 409;
}
