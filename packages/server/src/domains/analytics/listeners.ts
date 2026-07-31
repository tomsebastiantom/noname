import { eventBus } from "../../shared/event-bus";
import { ContextEvents } from "../context/events";
import { MachineEvents } from "../machines/events";
import type { AnalyticsService } from "./ports";

function subscribe(service: AnalyticsService, eventName: string) {
  eventBus.subscribe(eventName, (d) =>
    service.ingestServerEvent(eventName, d as Record<string, unknown>),
  );
}

export function registerAnalyticsListeners(service: AnalyticsService): void {
  // Documents — content lifecycle
  subscribe(service, "content.created");
  subscribe(service, "content.updated");
  subscribe(service, "content.deleted");
  subscribe(service, "content.published");

  // Documents — content type lifecycle
  subscribe(service, "content_type.created");
  subscribe(service, "content_type.updated");

  // Documents — layout lifecycle
  subscribe(service, "layout.created");
  subscribe(service, "layout.updated");
  subscribe(service, "layout.published");
  subscribe(service, "layout.archived");
  subscribe(service, "layout.variant_created");

  // Documents — asset lifecycle
  subscribe(service, "asset.created");
  subscribe(service, "asset.uploaded");
  subscribe(service, "asset.processed");
  subscribe(service, "asset.published");
  subscribe(service, "asset.archived");

  // Documents — page lifecycle
  subscribe(service, "page.created");
  subscribe(service, "page.updated");
  subscribe(service, "page.published");

  // Documents — page tree lifecycle
  subscribe(service, "page_tree.created");
  subscribe(service, "page_tree.updated");

  // Documents — tenant settings
  subscribe(service, "tenant_settings.updated");

  // Machines — workflow audit
  subscribe(service, MachineEvents.DEFINED);
  subscribe(service, MachineEvents.STARTED);
  subscribe(service, MachineEvents.TRANSITION);
  subscribe(service, MachineEvents.TRANSITION_REJECTED);

  // Context — segment resolution
  subscribe(service, ContextEvents.SEGMENT_RESOLVED);

  // Agent — task lifecycle
  subscribe(service, "task.created");
  subscribe(service, "task.started");
  subscribe(service, "task.completed");
  subscribe(service, "task.approved");
  subscribe(service, "task.rejected");
  subscribe(service, "task.failed");

  // Flags — flag lifecycle
  subscribe(service, "flag.created");
  subscribe(service, "flag.updated");
  subscribe(service, "flag.archived");
  subscribe(service, "flag.evaluated");
}
