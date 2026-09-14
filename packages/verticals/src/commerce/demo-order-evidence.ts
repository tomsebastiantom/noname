import type { CommerceEvidencePort } from "./order-projection";

/** Seeds a deterministic paid order fixture through the same Evidence port as projection. */
type CommerceEvidenceSeedPort = CommerceEvidencePort & {
  listLinks(orgId: string, recordId: string): Promise<unknown[]>;
};

export async function seedDemoOrderEvidence(
  evidence: CommerceEvidenceSeedPort,
  orgId: string,
): Promise<void> {
  const occurredAt = new Date("2026-09-14T12:00:00.000Z");
  const order = await evidence.appendRecord({
    orgId,
    type: "commerce.order.created",
    schemaVersion: 1,
    subjectType: "commerce.order",
    subjectId: "demo-order-1001",
    source: "commerce.demo-seed",
    occurredAt,
    correlationId: "demo-order-correlation-1001",
    causationId: "demo-cart-instance-1001",
    idempotencyKey: "commerce:demo:order:1001",
    data: {
      orderRef: "demo-order-1001",
      machineInstanceId: "demo-cart-instance-1001",
      machineName: "cart",
      paymentRef: "demo-payment-1001",
      amount: 9999,
      currency: "CAD",
      fromState: "awaiting_payment",
      toState: "paid",
    },
  });
  const payment = await evidence.appendRecord({
    orgId,
    type: "commerce.payment.receipt",
    schemaVersion: 1,
    subjectType: "commerce.payment",
    subjectId: "demo-payment-1001",
    source: "commerce.demo-seed",
    occurredAt,
    correlationId: "demo-order-correlation-1001",
    causationId: "demo-cart-instance-1001",
    idempotencyKey: "commerce:demo:payment:1001",
    data: {
      paymentRef: "demo-payment-1001",
      orderRef: "demo-order-1001",
      machineInstanceId: "demo-cart-instance-1001",
      amount: 9999,
      currency: "CAD",
      status: "succeeded",
    },
  });
  const activity = await evidence.appendActivity({
    orgId,
    type: "commerce.payment_succeeded",
    actorType: "system",
    inputRecordIds: [payment.id],
    outputRecordIds: [order.id],
    data: {
      orderRef: "demo-order-1001",
      paymentRef: "demo-payment-1001",
      machineInstanceId: "demo-cart-instance-1001",
    },
    occurredAt,
    correlationId: "demo-order-correlation-1001",
    causationId: "demo-cart-instance-1001",
    idempotencyKey: "commerce:demo:activity:payment-succeeded:1001",
  });
  const existingLinks = await evidence.listLinks(orgId, order.id);
  if (existingLinks.length > 0) return;
  await evidence.link({
    orgId,
    fromId: order.id,
    toId: payment.id,
    relation: "paid_by",
    metadata: { activityId: activity.id },
  });
  await evidence.link({
    orgId,
    fromId: order.id,
    toId: activity.id,
    relation: "caused_by",
  });
}
