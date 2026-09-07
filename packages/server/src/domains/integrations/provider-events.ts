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
  /** Provider-native event type (e.g. `checkout.session.completed`). */
  eventType: string;
  /** Raw provider payload — opaque to the platform. */
  payload: Record<string, unknown>;
}

/** Emitted for every attributed forward; backends subscribe by `integrationId/eventType`. */
export const PROVIDER_EVENT_RECEIVED = "provider.event.received";
