import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import { NotFoundError, StorageError } from "../../../shared/domain-error";
import type {
  WebhookOutboundDeliveryDTO,
  WebhookReceiptDTO,
  WebhookSubscriptionDTO,
} from "../ports";
import { webhookOutboundDeliveries, webhookReceipts, webhookSubscriptions } from "../schema";

export interface WebhookReceiptRow {
  id: string;
  orgId: string | null;
  provider: string;
  externalEventId: string;
  eventType: string;
  status: string;
  payload: Record<string, unknown> | null;
  error: string | null;
  createdAt: Date;
  processedAt: Date | null;
}

export interface WebhookSubscriptionRow {
  id: string;
  orgId: string;
  url: string;
  eventTypes: string[];
  enabled: boolean;
  description: string | null;
  consecutiveFailures: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookOutboundDeliveryRow {
  id: string;
  orgId: string;
  subscriptionId: string;
  eventType: string;
  eventId: string;
  payload: Record<string, unknown>;
  status: string;
  attemptCount: number;
  lastStatusCode: number | null;
  error: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
}

export interface WebhooksStorage {
  insertReceipt(input: {
    id?: string;
    orgId: string | null;
    provider: string;
    externalEventId: string;
    eventType: string;
    status: string;
    payload: Record<string, unknown>;
  }): Promise<{ row: WebhookReceiptRow; duplicate: boolean }>;
  updateReceipt(
    id: string,
    patch: Partial<Pick<WebhookReceiptRow, "status" | "error" | "processedAt" | "orgId">>,
  ): Promise<void>;
  findReceipt(id: string): Promise<WebhookReceiptRow | null>;

  listSubscriptions(orgId: string): Promise<WebhookSubscriptionRow[]>;
  findSubscription(orgId: string, id: string): Promise<WebhookSubscriptionRow | null>;
  insertSubscription(
    input: Omit<WebhookSubscriptionRow, "createdAt" | "updatedAt" | "consecutiveFailures">,
  ): Promise<WebhookSubscriptionRow>;
  updateSubscription(
    orgId: string,
    id: string,
    patch: Partial<
      Pick<
        WebhookSubscriptionRow,
        "url" | "eventTypes" | "enabled" | "description" | "consecutiveFailures"
      >
    >,
  ): Promise<WebhookSubscriptionRow>;
  deleteSubscription(orgId: string, id: string): Promise<void>;
  listEnabledSubscriptions(orgId: string, eventType: string): Promise<WebhookSubscriptionRow[]>;

  insertOutboundDelivery(
    input: Omit<
      WebhookOutboundDeliveryRow,
      "createdAt" | "deliveredAt" | "attemptCount" | "lastStatusCode" | "error"
    > & {
      attemptCount?: number;
      lastStatusCode?: number | null;
      error?: string | null;
      deliveredAt?: Date | null;
    },
  ): Promise<WebhookOutboundDeliveryRow>;
  updateOutboundDelivery(
    id: string,
    patch: Partial<
      Pick<
        WebhookOutboundDeliveryRow,
        "status" | "attemptCount" | "lastStatusCode" | "error" | "deliveredAt"
      >
    >,
  ): Promise<void>;
  findOutboundDelivery(id: string): Promise<WebhookOutboundDeliveryRow | null>;
  findOutboundDeliveryForOrg(orgId: string, id: string): Promise<WebhookOutboundDeliveryRow | null>;
  listOutboundDeliveries(orgId: string, limit?: number): Promise<WebhookOutboundDeliveryRow[]>;
}

function mapReceipt(row: typeof webhookReceipts.$inferSelect): WebhookReceiptRow {
  return {
    id: row.id,
    orgId: row.orgId,
    provider: row.provider,
    externalEventId: row.externalEventId,
    eventType: row.eventType,
    status: row.status,
    payload: row.payload,
    error: row.error,
    createdAt: row.createdAt,
    processedAt: row.processedAt,
  };
}

function mapSubscription(row: typeof webhookSubscriptions.$inferSelect): WebhookSubscriptionRow {
  return {
    id: row.id,
    orgId: row.orgId,
    url: row.url,
    eventTypes: row.eventTypes ?? [],
    enabled: row.enabled,
    description: row.description,
    consecutiveFailures: row.consecutiveFailures,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapOutbound(
  row: typeof webhookOutboundDeliveries.$inferSelect,
): WebhookOutboundDeliveryRow {
  return {
    id: row.id,
    orgId: row.orgId,
    subscriptionId: row.subscriptionId,
    eventType: row.eventType,
    eventId: row.eventId,
    payload: row.payload,
    status: row.status,
    attemptCount: row.attemptCount,
    lastStatusCode: row.lastStatusCode,
    error: row.error,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
  };
}

export function createWebhooksStorage(db: Database): WebhooksStorage {
  return {
    async insertReceipt(input) {
      const id = input.id ?? crypto.randomUUID();
      try {
        const [row] = await db
          .insert(webhookReceipts)
          .values({
            id,
            orgId: input.orgId,
            provider: input.provider,
            externalEventId: input.externalEventId,
            eventType: input.eventType,
            status: input.status,
            payload: input.payload,
          })
          .returning();
        if (!row) throw new StorageError("Failed to insert webhook receipt");
        return { row: mapReceipt(row), duplicate: false };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!message.includes("duplicate key") && !message.includes("unique")) {
          throw err;
        }
        const [existing] = await db
          .select()
          .from(webhookReceipts)
          .where(
            and(
              eq(webhookReceipts.provider, input.provider),
              eq(webhookReceipts.externalEventId, input.externalEventId),
            ),
          )
          .limit(1);
        if (!existing) throw err;
        return { row: mapReceipt(existing), duplicate: true };
      }
    },

    async updateReceipt(id, patch) {
      const set: Record<string, unknown> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.error !== undefined) set.error = patch.error;
      if (patch.processedAt !== undefined) set.processedAt = patch.processedAt;
      if (patch.orgId !== undefined) set.orgId = patch.orgId;
      if (Object.keys(set).length === 0) return;
      await db.update(webhookReceipts).set(set).where(eq(webhookReceipts.id, id));
    },

    async findReceipt(id) {
      const [row] = await db
        .select()
        .from(webhookReceipts)
        .where(eq(webhookReceipts.id, id))
        .limit(1);
      return row ? mapReceipt(row) : null;
    },

    async listSubscriptions(orgId) {
      const rows = await db
        .select()
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.orgId, orgId))
        .orderBy(desc(webhookSubscriptions.createdAt))
        .limit(200);
      return rows.map(mapSubscription);
    },

    async findSubscription(orgId, id) {
      const [row] = await db
        .select()
        .from(webhookSubscriptions)
        .where(and(eq(webhookSubscriptions.orgId, orgId), eq(webhookSubscriptions.id, id)))
        .limit(1);
      return row ? mapSubscription(row) : null;
    },

    async insertSubscription(input) {
      const [row] = await db
        .insert(webhookSubscriptions)
        .values({
          id: input.id,
          orgId: input.orgId,
          url: input.url,
          eventTypes: input.eventTypes,
          enabled: input.enabled,
          description: input.description,
        })
        .returning();
      if (!row) throw new StorageError("Failed to insert webhook subscription");
      return mapSubscription(row);
    },

    async updateSubscription(orgId, id, patch) {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (patch.url !== undefined) set.url = patch.url;
      if (patch.eventTypes !== undefined) set.eventTypes = patch.eventTypes;
      if (patch.enabled !== undefined) set.enabled = patch.enabled;
      if (patch.description !== undefined) set.description = patch.description;
      if (patch.consecutiveFailures !== undefined)
        set.consecutiveFailures = patch.consecutiveFailures;

      const [row] = await db
        .update(webhookSubscriptions)
        .set(set)
        .where(and(eq(webhookSubscriptions.orgId, orgId), eq(webhookSubscriptions.id, id)))
        .returning();
      if (!row) throw new NotFoundError("Webhook subscription", id);
      return mapSubscription(row);
    },

    async deleteSubscription(orgId, id) {
      await db
        .delete(webhookSubscriptions)
        .where(and(eq(webhookSubscriptions.orgId, orgId), eq(webhookSubscriptions.id, id)));
    },

    async listEnabledSubscriptions(orgId, eventType) {
      const rows = await db
        .select()
        .from(webhookSubscriptions)
        .where(and(eq(webhookSubscriptions.orgId, orgId), eq(webhookSubscriptions.enabled, true)))
        .limit(200);
      return rows
        .map(mapSubscription)
        .filter((sub) => sub.eventTypes.includes("*") || sub.eventTypes.includes(eventType));
    },

    async insertOutboundDelivery(input) {
      const [row] = await db
        .insert(webhookOutboundDeliveries)
        .values({
          id: input.id,
          orgId: input.orgId,
          subscriptionId: input.subscriptionId,
          eventType: input.eventType,
          eventId: input.eventId,
          payload: input.payload,
          status: input.status,
          attemptCount: input.attemptCount ?? 0,
          lastStatusCode: input.lastStatusCode ?? null,
          error: input.error ?? null,
          deliveredAt: input.deliveredAt ?? null,
        })
        .returning();
      if (!row) throw new StorageError("Failed to insert outbound delivery");
      return mapOutbound(row);
    },

    async updateOutboundDelivery(id, patch) {
      const set: Record<string, unknown> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.attemptCount !== undefined) set.attemptCount = patch.attemptCount;
      if (patch.lastStatusCode !== undefined) set.lastStatusCode = patch.lastStatusCode;
      if (patch.error !== undefined) set.error = patch.error;
      if (patch.deliveredAt !== undefined) set.deliveredAt = patch.deliveredAt;
      if (Object.keys(set).length === 0) return;
      await db
        .update(webhookOutboundDeliveries)
        .set(set)
        .where(eq(webhookOutboundDeliveries.id, id));
    },

    async findOutboundDelivery(id) {
      const [row] = await db
        .select()
        .from(webhookOutboundDeliveries)
        .where(eq(webhookOutboundDeliveries.id, id))
        .limit(1);
      return row ? mapOutbound(row) : null;
    },

    async findOutboundDeliveryForOrg(orgId, id) {
      const [row] = await db
        .select()
        .from(webhookOutboundDeliveries)
        .where(
          and(eq(webhookOutboundDeliveries.orgId, orgId), eq(webhookOutboundDeliveries.id, id)),
        )
        .limit(1);
      return row ? mapOutbound(row) : null;
    },

    async listOutboundDeliveries(orgId, limit = 50) {
      const rows = await db
        .select()
        .from(webhookOutboundDeliveries)
        .where(eq(webhookOutboundDeliveries.orgId, orgId))
        .orderBy(desc(webhookOutboundDeliveries.createdAt))
        .limit(Math.min(limit, 200));
      return rows.map(mapOutbound);
    },
  };
}

export function toReceiptDTO(row: WebhookReceiptRow): WebhookReceiptDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    provider: row.provider,
    externalEventId: row.externalEventId,
    eventType: row.eventType,
    status: row.status,
    error: row.error,
    createdAt: row.createdAt,
    processedAt: row.processedAt,
  };
}

export async function toSubscriptionDTO(
  row: WebhookSubscriptionRow,
  hasSigningSecret: boolean,
): Promise<WebhookSubscriptionDTO> {
  return {
    id: row.id,
    orgId: row.orgId,
    url: row.url,
    eventTypes: row.eventTypes,
    enabled: row.enabled,
    description: row.description,
    consecutiveFailures: row.consecutiveFailures,
    hasSigningSecret,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toOutboundDeliveryDTO(row: WebhookOutboundDeliveryRow): WebhookOutboundDeliveryDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    subscriptionId: row.subscriptionId,
    eventType: row.eventType,
    eventId: row.eventId,
    status: row.status,
    attemptCount: row.attemptCount,
    lastStatusCode: row.lastStatusCode,
    error: row.error,
    createdAt: row.createdAt,
    deliveredAt: row.deliveredAt,
  };
}
