import { AgentEvents } from "../agent/events";
import { MachineEvents } from "../machines/events";
import { CommsEvents } from "../notifications/events";
import { WebhookEvents } from "./events";
import type { WebhooksService } from "./ports";

export const WebhookPlatformEventTypes = {
  MACHINE_TRANSITION: "machine.transition",
  COMMS_SENT: "comms.sent",
  COMMS_FAILED: "comms.failed",
  WEBHOOK_RECEIVED: "webhook.received",
  AGENT_TASK_COMPLETED: "agent.task.completed",
} as const;

export function registerWebhookOutboundRouter(deps: {
  webhooks: Pick<WebhooksService, "deliverOutbound">;
  subscribe: (event: string, handler: (payload: unknown) => Promise<void>) => void;
}): void {
  deps.subscribe(MachineEvents.TRANSITION, async (rawPayload) => {
    const payload = rawPayload as {
      orgId?: string;
      instanceId?: string;
      event?: string;
      fromState?: string;
      toState?: string;
    };
    if (!payload.orgId || !payload.instanceId || !payload.event) return;

    const eventId = `${payload.orgId}:${payload.instanceId}:${payload.event}:${payload.toState ?? "unknown"}`;
    await deps.webhooks.deliverOutbound(
      payload.orgId,
      WebhookPlatformEventTypes.MACHINE_TRANSITION,
      {
        instanceId: payload.instanceId,
        event: payload.event,
        fromState: payload.fromState,
        toState: payload.toState,
      },
      eventId,
    );
  });

  deps.subscribe(CommsEvents.SENT, async (rawPayload) => {
    const payload = rawPayload as {
      orgId?: string;
      deliveryId?: string;
      provider?: string;
      messageId?: string;
    };
    if (!payload.orgId || !payload.deliveryId) return;

    await deps.webhooks.deliverOutbound(
      payload.orgId,
      WebhookPlatformEventTypes.COMMS_SENT,
      {
        deliveryId: payload.deliveryId,
        provider: payload.provider,
        messageId: payload.messageId,
      },
      `comms:${payload.orgId}:${payload.deliveryId}`,
    );
  });

  deps.subscribe(CommsEvents.FAILED, async (rawPayload) => {
    const payload = rawPayload as {
      orgId?: string;
      deliveryId?: string;
      error?: string;
    };
    if (!payload.orgId || !payload.deliveryId) return;

    await deps.webhooks.deliverOutbound(
      payload.orgId,
      WebhookPlatformEventTypes.COMMS_FAILED,
      {
        deliveryId: payload.deliveryId,
        error: payload.error,
      },
      `comms-failed:${payload.orgId}:${payload.deliveryId}`,
    );
  });

  deps.subscribe(WebhookEvents.RECEIVED, async (rawPayload) => {
    const payload = rawPayload as {
      orgId?: string | null;
      receiptId?: string;
      provider?: string;
      eventType?: string;
      payload?: Record<string, unknown>;
    };
    if (!payload.orgId || !payload.receiptId) return;

    await deps.webhooks.deliverOutbound(
      payload.orgId,
      WebhookPlatformEventTypes.WEBHOOK_RECEIVED,
      {
        receiptId: payload.receiptId,
        provider: payload.provider,
        eventType: payload.eventType,
        payload: payload.payload ?? {},
      },
      `inbound:${payload.provider}:${payload.receiptId}`,
    );
  });

  deps.subscribe(AgentEvents.COMPLETED, async (rawPayload) => {
    const payload = rawPayload as {
      orgId?: string;
      taskId?: string;
      type?: string;
    };
    if (!payload.orgId || !payload.taskId) return;

    await deps.webhooks.deliverOutbound(
      payload.orgId,
      WebhookPlatformEventTypes.AGENT_TASK_COMPLETED,
      {
        taskId: payload.taskId,
        type: payload.type,
      },
      `agent:${payload.orgId}:${payload.taskId}`,
    );
  });
}
