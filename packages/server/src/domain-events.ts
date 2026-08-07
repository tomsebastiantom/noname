import { AgentEvents } from "./domains/agent/events";
import { ContextEvents } from "./domains/context/events";
import {
  AssetEvents,
  ContentEvents,
  ContentTypeEvents,
  LayoutEvents,
  PageEvents,
  PageTreeEvents,
  TenantSettingsEvents,
} from "./domains/documents/events";
import { FlagEvents } from "./domains/flags/events";
import { MachineEvents } from "./domains/machines/events";
import { CommsEvents } from "./domains/notifications/events";
import { WebhookEvents } from "./domains/webhooks/events";

type ValueOf<T> = T[keyof T];

/** Event constant objects wired into analytics auto-subscribe. Add a module here only when every event in it publishes. */
export const DOMAIN_EVENT_SOURCES = [
  AgentEvents,
  ContextEvents,
  ContentEvents,
  ContentTypeEvents,
  LayoutEvents,
  AssetEvents,
  PageEvents,
  PageTreeEvents,
  TenantSettingsEvents,
  FlagEvents,
  MachineEvents,
  CommsEvents,
  WebhookEvents,
] as const;

/** Event names with active publishers — analytics and other subscribers use this list. */
export type DomainEventName =
  | ValueOf<typeof AgentEvents>
  | ValueOf<typeof ContextEvents>
  | ValueOf<typeof ContentEvents>
  | ValueOf<typeof ContentTypeEvents>
  | ValueOf<typeof LayoutEvents>
  | ValueOf<typeof AssetEvents>
  | ValueOf<typeof PageEvents>
  | ValueOf<typeof PageTreeEvents>
  | ValueOf<typeof TenantSettingsEvents>
  | ValueOf<typeof FlagEvents>
  | ValueOf<typeof MachineEvents>
  | ValueOf<typeof CommsEvents>
  | ValueOf<typeof WebhookEvents>;

export const ALL_DOMAIN_EVENTS: readonly DomainEventName[] = DOMAIN_EVENT_SOURCES.flatMap(
  (events) => Object.values(events),
);
