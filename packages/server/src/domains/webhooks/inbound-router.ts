import type { MachineEngine } from "../machines/ports";
import type { WebhookReceivedPayload } from "./ports";
import { WebhookEvents } from "./events";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseMachineTransitionHint(payload: Record<string, unknown>): {
  instanceId: string;
  event: string;
  params: Record<string, unknown>;
} | null {
  const meta =
    payload.metadata && typeof payload.metadata === "object"
      ? (payload.metadata as Record<string, unknown>)
      : payload;

  const instanceId =
    readString(meta.machine_instance_id) ??
    readString(meta.machineInstanceId) ??
    readString(payload.machine_instance_id) ??
    readString(payload.machineInstanceId);

  const event =
    readString(meta.machine_event) ??
    readString(meta.machineEvent) ??
    readString(payload.machine_event) ??
    readString(payload.machineEvent);

  if (!instanceId || !event) return null;

  const rawParams = meta.machine_params ?? meta.machineParams ?? payload.machine_params ?? payload.machineParams;
  const params =
    rawParams && typeof rawParams === "object" && !Array.isArray(rawParams)
      ? (rawParams as Record<string, unknown>)
      : {};

  return { instanceId, event, params };
}

export function registerWebhookInboundRouter(deps: {
  machines: Pick<MachineEngine, "transition">;
  subscribe: (event: string, handler: (payload: unknown) => Promise<void>) => void;
}): void {
  deps.subscribe(WebhookEvents.RECEIVED, async (rawPayload) => {
    const payload = rawPayload as WebhookReceivedPayload;
    if (!payload.orgId) return;

    const hint = parseMachineTransitionHint(payload.payload);
    if (!hint) return;

    try {
      await deps.machines.transition(payload.orgId, hint.instanceId, hint.event, hint.params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn("[webhook.received] machine transition failed:", {
        orgId: payload.orgId,
        instanceId: hint.instanceId,
        event: hint.event,
        error: message,
      });
    }
  });
}
