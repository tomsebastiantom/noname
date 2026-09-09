export interface CapabilityContext {
  orgId: string;
  actorId?: string;
  requestId: string;
  idempotencyKey: string;
}

export type CapabilityHandler = (input: unknown, context: CapabilityContext) => Promise<unknown>;
