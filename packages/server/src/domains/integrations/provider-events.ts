/**
 * Nango-forwarded provider events — transport + attribution ONLY.
 *
 * The platform verifies Nango's forwarding signature, resolves the org from
 * the connection, and emits the raw provider envelope. It never interprets
 * provider shapes: no per-provider mappers, no canonical payment types here.
 * Mapping provider payloads to domain logic is each backend's job (they own
 * their provider's semantics). This file must stay provider-agnostic no
 * matter how many integrations exist.
 */

/** Nango-forwarded provider event, attributed to an org + connection. */
export interface ProviderForwardedEvent {
  orgId: string;
  integrationId: string;
  connectionId: string;
  providerEventId?: string;
  deliveryId?: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface NormalizedProviderEvent {
  orgId: string;
  integrationId: string;
  connectionId: string;
  providerEventId?: string;
  deliveryId?: string;
  sourceEventType: string;
  event: string;
  params: Record<string, unknown>;
  machineInstanceId?: string;
}

export interface ProviderEventMapping {
  integrationId: string;
  eventType: string;
  normalize: (
    event: ProviderForwardedEvent,
  ) =>
    | Omit<
        NormalizedProviderEvent,
        | "orgId"
        | "integrationId"
        | "connectionId"
        | "providerEventId"
        | "deliveryId"
        | "sourceEventType"
      >
    | null;
}

export const PROVIDER_EVENT_RECEIVED = "provider.event.received";
export const PROVIDER_EVENT_NORMALIZED = "provider.event.normalized";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function createMachineEventMapping(): ProviderEventMapping {
  return {
    integrationId: "*",
    eventType: "*",
    normalize: (event) => {
      const metadata =
        event.payload.metadata && typeof event.payload.metadata === "object"
          ? (event.payload.metadata as Record<string, unknown>)
          : event.payload;
      const machineInstanceId = readString(
        metadata.machineInstanceId ?? metadata.machine_instance_id,
      );
      const normalizedEvent = readString(metadata.machineEvent ?? metadata.machine_event);
      if (!machineInstanceId || !normalizedEvent) return null;
      const rawParams = metadata.machineParams ?? metadata.machine_params;
      const params =
        rawParams && typeof rawParams === "object" && !Array.isArray(rawParams)
          ? (rawParams as Record<string, unknown>)
          : {};
      return { event: normalizedEvent, params, machineInstanceId };
    },
  };
}

export function createProviderEventRegistry(mappings: ProviderEventMapping[] = []) {
  const registry = new Map<string, ProviderEventMapping>();
  for (const mapping of mappings) {
    registry.set(`${mapping.integrationId}/${mapping.eventType}`, mapping);
  }

  return {
    register(mapping: ProviderEventMapping): void {
      registry.set(`${mapping.integrationId}/${mapping.eventType}`, mapping);
    },
    normalize(event: ProviderForwardedEvent): NormalizedProviderEvent | null {
      const mapping =
        registry.get(`${event.integrationId}/${event.eventType}`) ??
        registry.get(`${event.integrationId}/*`) ??
        registry.get(`*/${event.eventType}`) ??
        registry.get("*/*");
      if (!mapping) return null;
      const normalized = mapping.normalize(event);
      if (!normalized) return null;
      return {
        ...normalized,
        orgId: event.orgId,
        integrationId: event.integrationId,
        connectionId: event.connectionId,
        providerEventId: event.providerEventId,
        deliveryId: event.deliveryId,
        sourceEventType: event.eventType,
      };
    },
  };
}
