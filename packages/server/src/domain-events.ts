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

type ValueOf<T> = T[keyof T];

/** All known domain event names — single source of truth for subscribers. */
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
  | ValueOf<typeof MachineEvents>;

/** Phase 2 payload map — loose `Record` until per-event shapes are defined. */
export type DomainEventMap = {
  [K in DomainEventName]: Record<string, unknown>;
};

export const ALL_DOMAIN_EVENTS: readonly DomainEventName[] = [
  ...Object.values(AgentEvents),
  ...Object.values(ContextEvents),
  ...Object.values(ContentEvents),
  ...Object.values(ContentTypeEvents),
  ...Object.values(LayoutEvents),
  ...Object.values(AssetEvents),
  ...Object.values(PageEvents),
  ...Object.values(PageTreeEvents),
  ...Object.values(TenantSettingsEvents),
  ...Object.values(FlagEvents),
  ...Object.values(MachineEvents),
];
