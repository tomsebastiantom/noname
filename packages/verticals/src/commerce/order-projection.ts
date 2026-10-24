export type CommerceEvidencePort = {
  appendRecord(input: {
    orgId: string;
    type: string;
    schemaVersion?: number;
    subjectType: string;
    subjectId: string;
    data: Record<string, unknown>;
    source: string;
    occurredAt?: Date;
    correlationId?: string;
    causationId?: string;
    idempotencyKey?: string;
  }): Promise<{ id: string; recordedAt: Date }>;
  appendActivity(input: {
    orgId: string;
    type: string;
    actorType: "user" | "service" | "provider" | "system";
    actorId?: string;
    inputRecordIds?: string[];
    outputRecordIds?: string[];
    data?: Record<string, unknown>;
    occurredAt?: Date;
    correlationId?: string;
    causationId?: string;
    idempotencyKey?: string;
  }): Promise<{ id: string; recordedAt: Date }>;
  link(input: {
    orgId: string;
    fromId: string;
    toId: string;
    relation: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string; createdAt: Date }>;
  listRecords?(query: {
    orgId: string;
    type?: string;
    subjectType?: string;
    subjectId?: string;
    limit?: number;
  }): Promise<
    Array<{
      id: string;
      type: string;
      subjectId: string;
      data: Record<string, unknown>;
      recordedAt: Date;
    }>
  >;
  listLinks?(orgId: string, recordId: string): Promise<Array<Record<string, unknown>>>;
};

export type CommerceTransitionComplete = {
  orgId: string;
  instance: {
    id: string;
    machineName: string;
    currentState: string;
    context: Record<string, unknown>;
    revision?: number;
    updatedAt: Date;
  };
  event: string;
  fromState: string;
  toState: string;
  params: Record<string, unknown>;
};

/**
 * Stable identity of the transition that caused a record: `{instanceId}:{revision}`.
 *
 * `revision` increments with every committed transition, so the pair names one occurrence. When it is
 * absent (older rows, or a storage that does not carry it) the transition time is the best available
 * discriminator, and it is what the Evidence idempotency key already falls back to.
 */
function transitionIdentity(transition: CommerceTransitionComplete, occurredAt: Date): string {
  return `${transition.instance.id}:${transition.instance.revision ?? occurredAt.getTime()}`;
}

export function createCommerceOrderProjector(evidence: CommerceEvidencePort) {
  return async (transition: CommerceTransitionComplete): Promise<void> => {
    if (transition.instance.machineName !== "cart") return;
    if (transition.event === "PAYMENT_SUCCEEDED") {
      await projectPaidOrder(evidence, transition);
      return;
    }
    if (transition.event === "CANCEL_ORDER" || transition.event === "MARK_FULFILLED") {
      await projectOrderOperation(evidence, transition);
    }
  };
}

async function projectPaidOrder(
  evidence: CommerceEvidencePort,
  transition: CommerceTransitionComplete,
): Promise<void> {
  const context = transition.instance.context;
  const snapshot = readSnapshot(context.checkoutSnapshot);
  const orderRef = readString(context.orderRef) ?? `order:${transition.instance.id}`;
  const paymentRef =
    readString(transition.params.paymentRef) ??
    readString(context.paymentRef) ??
    `payment:${transition.instance.id}`;
  const occurredAt = readDate(context.paidAt) ?? transition.instance.updatedAt;
  const currency = snapshot?.currency ?? readString(context.checkoutCurrency) ?? "CAD";
  const amountMinor =
    snapshot?.totalMinor ?? numeric(context.checkoutAmount) ?? numeric(transition.params.amount);
  const exponent = snapshot?.minorUnitExponent ?? 2;
  const correlationId =
    readString(transition.params.correlationId) ??
    readString(context.correlationId) ??
    transition.instance.id;

  const order = await evidence.appendRecord({
    orgId: transition.orgId,
    type: "commerce.order.created",
    schemaVersion: 2,
    subjectType: "commerce.order",
    subjectId: orderRef,
    source: "commerce.machine",
    occurredAt,
    correlationId,
    causationId: transitionIdentity(transition, occurredAt),
    idempotencyKey: `commerce:order:${transition.instance.id}`,
    data: {
      orderRef,
      machineInstanceId: transition.instance.id,
      machineName: transition.instance.machineName,
      paymentRef,
      amount: amountMinor,
      amountMinor,
      currency,
      minorUnitExponent: exponent,
      lineItems: snapshot?.lines ?? [],
      detailCompleteness: snapshot ? "complete" : "partial",
      paymentStatus: "paid",
      fulfillmentStatus: "unfulfilled",
      fromState: transition.fromState,
      toState: transition.toState,
    },
  });

  const payment = await evidence.appendRecord({
    orgId: transition.orgId,
    type: "commerce.payment.receipt",
    schemaVersion: 2,
    subjectType: "commerce.payment",
    subjectId: paymentRef,
    source: "commerce.machine",
    occurredAt,
    correlationId,
    causationId: transitionIdentity(transition, occurredAt),
    idempotencyKey: `commerce:payment:${paymentRef}`,
    data: {
      paymentRef,
      orderRef,
      machineInstanceId: transition.instance.id,
      amount: transition.params.amount ?? amountMinor,
      amountMinor,
      currency,
      minorUnitExponent: exponent,
      status: "succeeded",
    },
  });

  const activity = await evidence.appendActivity({
    orgId: transition.orgId,
    type: "commerce.payment_succeeded",
    actorType: "system",
    inputRecordIds: [payment.id],
    outputRecordIds: [order.id],
    data: { orderRef, paymentRef, machineInstanceId: transition.instance.id },
    occurredAt,
    correlationId,
    causationId: transitionIdentity(transition, occurredAt),
    idempotencyKey: `commerce:payment-succeeded:${transition.instance.id}`,
  });

  await evidence.link({
    orgId: transition.orgId,
    fromId: order.id,
    toId: payment.id,
    relation: "paid_by",
    metadata: { activityId: activity.id },
  });
  await evidence.link({
    orgId: transition.orgId,
    fromId: order.id,
    toId: activity.id,
    relation: "caused_by",
  });
}

async function projectOrderOperation(
  evidence: CommerceEvidencePort,
  transition: CommerceTransitionComplete,
): Promise<void> {
  const cancelled = transition.event === "CANCEL_ORDER";
  const orderRef =
    readString(transition.instance.context.orderRef) ?? `order:${transition.instance.id}`;
  const occurredAt = transition.instance.updatedAt;
  const actorId = readString(transition.params.actorId);
  const type = cancelled ? "commerce.order.cancelled" : "commerce.order.fulfilled";
  const record = await evidence.appendRecord({
    orgId: transition.orgId,
    type,
    schemaVersion: 1,
    subjectType: "commerce.order",
    subjectId: orderRef,
    source: "commerce.capability",
    occurredAt,
    correlationId: transition.instance.id,
    /**
     * The *specific* transition, not the workflow.
     *
     * `correlationId` groups everything about this order (one workflow); `causationId` names the immediate
     * predecessor of this record. Setting both to the instance id threw that distinction away — it made
     * "which transition produced this record?" unanswerable, and read as though the record caused itself.
     * Using the transition's own identity also matches the idempotency key below, so the two agree.
     */
    causationId: transitionIdentity(transition, occurredAt),
    idempotencyKey: `commerce:${cancelled ? "cancelled" : "fulfilled"}:${transition.instance.id}:${transition.instance.revision ?? occurredAt.getTime()}`,
    data: {
      orderRef,
      machineInstanceId: transition.instance.id,
      fromState: transition.fromState,
      toState: transition.toState,
      actorId: actorId ?? null,
      reason: readString(transition.params.reason) ?? null,
      fulfillmentReference: readString(transition.params.fulfillmentReference) ?? null,
      carrier: readString(transition.params.carrier) ?? null,
      trackingNumber: readString(transition.params.trackingNumber) ?? null,
      paymentStatus: "paid",
      fulfillmentStatus: cancelled ? "unfulfilled" : "fulfilled",
    },
  });
  const activity = await evidence.appendActivity({
    orgId: transition.orgId,
    type,
    actorType: actorId ? "user" : "system",
    actorId,
    outputRecordIds: [record.id],
    data: { orderRef, machineInstanceId: transition.instance.id, event: transition.event },
    occurredAt,
    correlationId: transition.instance.id,
    causationId: transitionIdentity(transition, occurredAt),
    idempotencyKey: `commerce:activity:${record.id}`,
  });
  await evidence.link({
    orgId: transition.orgId,
    fromId: record.id,
    toId: activity.id,
    relation: "caused_by",
  });
}

function readSnapshot(value: unknown): {
  currency: string;
  minorUnitExponent: number;
  totalMinor: number;
  lines: Array<Record<string, unknown>>;
} | null {
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
  };
}

function readDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function numeric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
