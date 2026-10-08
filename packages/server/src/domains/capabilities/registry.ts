import type { PermissionKey } from "@noname/auth";
import { PERMISSIONS } from "@noname/auth";

export interface CapabilityContext {
  orgId: string;
  actorId?: string;
  requestId: string;
  idempotencyKey: string;
}

export type CapabilityHandler = (input: unknown, context: CapabilityContext) => Promise<unknown>;
export type CapabilityKind = "command" | "query";

export interface CapabilityPolicy {
  kind: CapabilityKind;
  permission?: PermissionKey;
  /** Named extension required to be installed for the context organization. */
  extension?: string;
  /** Public access still requires server validation of the publishable key. */
  publicAccess?: "publishable-key";
  /** Resource-level check that must run before command idempotency replay. */
  authorize?: (input: unknown, context: CapabilityContext) => Promise<boolean>;
}

export interface CapabilityDefinition extends CapabilityPolicy {
  handler: CapabilityHandler;
}

export type CapabilityRegistration = CapabilityHandler | CapabilityDefinition;

export interface CapabilityRegistry {
  register(name: string, registration: CapabilityRegistration): void;
  resolve(name: string): CapabilityHandler | undefined;
  definition(name: string): CapabilityDefinition | undefined;
  names(): string[];
}

function normalizeRegistration(registration: CapabilityRegistration): CapabilityDefinition {
  if (typeof registration === "function") {
    // Legacy handlers retain the old runtime policy until they opt into metadata.
    return { handler: registration, kind: "command", permission: PERMISSIONS.STOREFRONT_VIEW };
  }
  return { ...registration };
}

export function createCapabilityRegistry(
  handlers: Record<string, CapabilityRegistration> = {},
): CapabilityRegistry {
  const entries = new Map(
    Object.entries(handlers).map(([name, registration]) => [
      normalizeCapabilityName(name),
      normalizeRegistration(registration),
    ]),
  );
  return {
    register(name, registration) {
      const normalized = normalizeCapabilityName(name);
      if (entries.has(normalized)) throw new Error(`Capability already registered: ${normalized}`);
      entries.set(normalized, normalizeRegistration(registration));
    },
    resolve(name) {
      return entries.get(normalizeCapabilityName(name))?.handler;
    },
    definition(name) {
      return entries.get(normalizeCapabilityName(name));
    },
    names() {
      return [...entries.keys()].sort();
    },
  };
}

export function normalizeCapabilityName(name: string): string {
  const normalized = name.trim().toLowerCase();
  if (!/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/.test(normalized)) {
    throw new Error("Capability name must use namespace.action format");
  }
  return normalized;
}

export type { PermissionKey };
export { PERMISSIONS };
