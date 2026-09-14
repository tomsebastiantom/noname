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
};

export type CommerceTransitionComplete = {
  orgId: string;
  instance: {
    id: string;
    machineName: string;
    currentState: string;
    context: Record<string, unknown>;
    updatedAt: Date;
  };
  event: string;
  fromState: string;
  toState: string;
  params: Record<string, unknown>;
};

export function createCommerceOrderProjector(evidence: CommerceEvidencePort) {
  return async (transition: CommerceTransitionComplete): Promise<void> => {
    if (transition.event !== "PAYMENT_SUCCEEDED" || transition.instance.machineName !== "cart") {
      return;
    }

    const context = transition.instance.context;
    const orderRef = readString(context.orderRef) ?? `order:${transition.instance.id}`;
    const paymentRef =
      readString(transition.params.paymentRef) ??
      readString(context.paymentRef) ??
      `payment:${transition.instance.id}`;
    const occurredAt = transition.instance.updatedAt;
    const correlationId =
      readString(transition.params.correlationId) ??
      readString(context.correlationId) ??
      transition.instance.id;

    const order = await evidence.appendRecord({
      orgId: transition.orgId,
      type: "commerce.order.created",
      schemaVersion: 1,
      subjectType: "commerce.order",
      subjectId: orderRef,
      source: "commerce.machine",
      occurredAt,
      correlationId,
      causationId: transition.instance.id,
      idempotencyKey: `commerce:order:${transition.instance.id}`,
      data: {
        orderRef,
        machineInstanceId: transition.instance.id,
        machineName: transition.instance.machineName,
        paymentRef,
        amount: transition.params.amount ?? context.checkoutAmount,
        currency: transition.params.currency ?? context.checkoutCurrency,
        fromState: transition.fromState,
        toState: transition.toState,
      },
    });

    const payment = await evidence.appendRecord({
      orgId: transition.orgId,
      type: "commerce.payment.receipt",
      schemaVersion: 1,
      subjectType: "commerce.payment",
      subjectId: paymentRef,
      source: "commerce.machine",
      occurredAt,
      correlationId,
      causationId: transition.instance.id,
      idempotencyKey: `commerce:payment:${paymentRef}`,
      data: {
        paymentRef,
        orderRef,
        machineInstanceId: transition.instance.id,
        amount: transition.params.amount ?? context.checkoutAmount,
        currency: transition.params.currency ?? context.checkoutCurrency,
        status: "succeeded",
      },
    });

    const activity = await evidence.appendActivity({
      orgId: transition.orgId,
      type: "commerce.payment_succeeded",
      actorType: "system",
      inputRecordIds: [payment.id],
      outputRecordIds: [order.id],
      data: {
        orderRef,
        paymentRef,
        machineInstanceId: transition.instance.id,
      },
      occurredAt,
      correlationId,
      causationId: transition.instance.id,
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
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
