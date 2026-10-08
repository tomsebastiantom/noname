import { PERMISSIONS, type PermissionKey } from "@noname/auth";

export interface CapabilityContext {
  orgId: string;
  actorId?: string;
  requestId: string;
  idempotencyKey: string;
}

export type CapabilityHandler = (input: unknown, context: CapabilityContext) => Promise<unknown>;

export interface CapabilityDescriptor {
  handler: CapabilityHandler;
  kind: "command" | "query";
  permission: PermissionKey;
  extension: string;
  publicAccess?: "publishable-key";
  authorize?: (input: unknown, context: CapabilityContext) => Promise<boolean>;
}

export function capabilityDescriptor(
  handler: CapabilityHandler,
  kind: CapabilityDescriptor["kind"],
  permission: PermissionKey,
  options: Pick<CapabilityDescriptor, "extension" | "publicAccess" | "authorize">,
): CapabilityDescriptor {
  return { handler, kind, permission, ...options };
}

export { PERMISSIONS };
