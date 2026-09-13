import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "../../drizzle";
import { providerEventReceipts } from "./provider-event-schema";
import type { ProviderForwardedEvent } from "./provider-events";

export type ProviderReceiptClaim = "claimed" | "duplicate";

export interface ProviderEventReceiptStore {
  claim(event: ProviderForwardedEvent): Promise<ProviderReceiptClaim>;
  complete(event: ProviderForwardedEvent): Promise<void>;
  fail(event: ProviderForwardedEvent, message: string): Promise<void>;
}

export function providerEventKey(event: ProviderForwardedEvent): string {
  const identity = event.providerEventId ?? event.deliveryId;
  if (identity) return `${event.integrationId}:${identity}`;
  return `${event.integrationId}:${event.eventType}:${createHash("sha256").update(stableStringify(event.payload)).digest("hex")}`;
}

export function createProviderEventReceiptStore(db: Database): ProviderEventReceiptStore {
  return {
    async claim(event) {
      const eventKey = providerEventKey(event);
      const inserted = await db
        .insert(providerEventReceipts)
        .values({
          orgId: event.orgId,
          connectionId: event.connectionId,
          eventKey,
          providerEventId: event.providerEventId,
          deliveryId: event.deliveryId,
          eventType: event.eventType,
          payload: event.payload,
          status: "processing",
        })
        .onConflictDoNothing({
          target: [providerEventReceipts.connectionId, providerEventReceipts.eventKey],
        })
        .returning({ id: providerEventReceipts.id });
      if (inserted.length > 0) return "claimed";

      const [existing] = await db
        .select({ status: providerEventReceipts.status })
        .from(providerEventReceipts)
        .where(
          and(
            eq(providerEventReceipts.connectionId, event.connectionId),
            eq(providerEventReceipts.eventKey, eventKey),
          ),
        )
        .limit(1);
      if (!existing || existing.status === "failed") {
        await db
          .update(providerEventReceipts)
          .set({ status: "processing", error: null, updatedAt: new Date() })
          .where(
            and(
              eq(providerEventReceipts.connectionId, event.connectionId),
              eq(providerEventReceipts.eventKey, eventKey),
            ),
          );
        return "claimed";
      }
      return "duplicate";
    },

    async complete(event) {
      await db
        .update(providerEventReceipts)
        .set({ status: "completed", error: null, updatedAt: new Date() })
        .where(
          and(
            eq(providerEventReceipts.connectionId, event.connectionId),
            eq(providerEventReceipts.eventKey, providerEventKey(event)),
          ),
        );
    },

    async fail(event, message) {
      await db
        .update(providerEventReceipts)
        .set({ status: "failed", error: message, updatedAt: new Date() })
        .where(
          and(
            eq(providerEventReceipts.connectionId, event.connectionId),
            eq(providerEventReceipts.eventKey, providerEventKey(event)),
          ),
        );
    },
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "undefined";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(",")}}`;
}
