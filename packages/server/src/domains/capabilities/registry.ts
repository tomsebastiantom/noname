export interface CapabilityContext {
  orgId: string;
  actorId?: string;
  requestId: string;
  idempotencyKey: string;
}

export type CapabilityHandler = (
  input: unknown,
  context: CapabilityContext,
) => Promise<unknown>;

export interface CapabilityRegistry {
  register(name: string, handler: CapabilityHandler): void;
  resolve(name: string): CapabilityHandler | undefined;
  names(): string[];
}

export function createCapabilityRegistry(
  handlers: Record<string, CapabilityHandler> = {},
): CapabilityRegistry {
  const entries = new Map(Object.entries(handlers));
  return {
    register(name, handler) {
      const normalized = normalizeCapabilityName(name);
      if (entries.has(normalized)) throw new Error(`Capability already registered: ${normalized}`);
      entries.set(normalized, handler);
    },
    resolve(name) {
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
