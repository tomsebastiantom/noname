import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import type {
  CommsDeliveryDTO,
  CommsDeliveryEventDTO,
  ListDeliveriesQuery,
  ListInboxQuery,
} from "../ports";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  mergeNotificationPreferences,
  normalizeNotificationPreferences,
  type NotificationPreferences,
  type NotificationPreferencesUpdate,
} from "../preferences";
import {
  commsDeliveries,
  commsDeliveryEvents,
  commsInboxItems,
  notificationPreferences,
} from "../schema";

export interface CommsDeliveryRow {
  id: string;
  orgId: string;
  userId: string | null;
  channel: string;
  provider: string;
  toAddress: string;
  subject: string | null;
  status: string;
  providerMessageId: string | null;
  error: string | null;
  trigger: string | null;
  templateId: string | null;
  idempotencyKey: string | null;
  attemptCount: number;
  bodyHtml: string | null;
  bodyText: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

export interface NotificationPreferencesRow {
  orgId: string;
  userId: string;
  preferences: NotificationPreferences;
  updatedAt: Date;
}

export interface CommsInboxItemRow {
  id: string;
  orgId: string;
  userId: string;
  title: string;
  body: string;
  trigger: string | null;
  metadata: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export interface CommsDeliveryEventRow {
  id: string;
  orgId: string;
  deliveryId: string;
  eventType: string;
  occurredAt: Date;
  providerEventId: string | null;
  rawPayload: Record<string, unknown>;
  createdAt: Date;
}

export interface NotificationsStorage {
  insertDelivery(
    input: Omit<
      CommsDeliveryRow,
      "createdAt" | "sentAt" | "providerMessageId" | "error" | "attemptCount"
    > & {
      providerMessageId?: string | null;
      error?: string | null;
      sentAt?: Date | null;
      attemptCount?: number;
      bodyHtml?: string | null;
      bodyText?: string | null;
    },
  ): Promise<CommsDeliveryRow>;
  updateDelivery(
    id: string,
    patch: Partial<
      Pick<CommsDeliveryRow, "status" | "providerMessageId" | "error" | "sentAt" | "attemptCount">
    >,
  ): Promise<void>;
  findDelivery(orgId: string, id: string): Promise<CommsDeliveryRow | null>;
  findDeliveryByIdempotency(
    orgId: string,
    idempotencyKey: string,
  ): Promise<CommsDeliveryRow | null>;
  listDeliveries(orgId: string, query?: ListDeliveriesQuery): Promise<CommsDeliveryRow[]>;
  findDeliveryByProviderMessageId(
    provider: string,
    providerMessageId: string,
  ): Promise<CommsDeliveryRow | null>;
  insertDeliveryEvent(
    input: Omit<CommsDeliveryEventRow, "createdAt">,
  ): Promise<{ row: CommsDeliveryEventRow; duplicate: boolean }>;
  listDeliveryEventsForDeliveries(deliveryIds: string[]): Promise<CommsDeliveryEventRow[]>;
  getPreferences(orgId: string, userId: string): Promise<NotificationPreferencesRow>;
  upsertPreferences(
    orgId: string,
    userId: string,
    patch: NotificationPreferencesUpdate,
  ): Promise<NotificationPreferencesRow>;
  insertInboxItem(
    input: Omit<CommsInboxItemRow, "createdAt" | "readAt"> & { readAt?: Date | null },
  ): Promise<CommsInboxItemRow>;
  listInboxItems(
    orgId: string,
    userId: string,
    query?: ListInboxQuery,
  ): Promise<CommsInboxItemRow[]>;
  markInboxRead(orgId: string, userId: string, itemId: string): Promise<CommsInboxItemRow | null>;
}

function mapRow(row: typeof commsDeliveries.$inferSelect): CommsDeliveryRow {
  return {
    id: row.id,
    orgId: row.orgId,
    userId: row.userId,
    channel: row.channel,
    provider: row.provider,
    toAddress: row.toAddress,
    subject: row.subject,
    status: row.status,
    providerMessageId: row.providerMessageId,
    error: row.error,
    trigger: row.trigger,
    templateId: row.templateId,
    idempotencyKey: row.idempotencyKey,
    attemptCount: row.attemptCount,
    bodyHtml: row.bodyHtml,
    bodyText: row.bodyText,
    createdAt: row.createdAt,
    sentAt: row.sentAt,
  };
}

export function createNotificationsStorage(db: Database): NotificationsStorage {
  return {
    async insertDelivery(input) {
      const [row] = await db
        .insert(commsDeliveries)
        .values({
          id: input.id,
          orgId: input.orgId,
          userId: input.userId,
          channel: input.channel,
          provider: input.provider,
          toAddress: input.toAddress,
          subject: input.subject,
          status: input.status,
          providerMessageId: input.providerMessageId ?? null,
          error: input.error ?? null,
          trigger: input.trigger ?? null,
          templateId: input.templateId ?? null,
          idempotencyKey: input.idempotencyKey ?? null,
          attemptCount: input.attemptCount ?? 0,
          bodyHtml: input.bodyHtml ?? null,
          bodyText: input.bodyText ?? null,
          sentAt: input.sentAt ?? null,
        })
        .returning();
      if (!row) throw new Error("Failed to insert comms delivery");
      return mapRow(row);
    },

    async updateDelivery(id, patch) {
      const set: Record<string, unknown> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.providerMessageId !== undefined) set.providerMessageId = patch.providerMessageId;
      if (patch.error !== undefined) set.error = patch.error;
      if (patch.sentAt !== undefined) set.sentAt = patch.sentAt;
      if (patch.attemptCount !== undefined) set.attemptCount = patch.attemptCount;
      if (Object.keys(set).length === 0) return;
      await db.update(commsDeliveries).set(set).where(eq(commsDeliveries.id, id));
    },

    async findDelivery(orgId, id) {
      const [row] = await db
        .select()
        .from(commsDeliveries)
        .where(and(eq(commsDeliveries.orgId, orgId), eq(commsDeliveries.id, id)))
        .limit(1);
      return row ? mapRow(row) : null;
    },

    async findDeliveryByIdempotency(orgId, idempotencyKey) {
      const [row] = await db
        .select()
        .from(commsDeliveries)
        .where(
          and(eq(commsDeliveries.orgId, orgId), eq(commsDeliveries.idempotencyKey, idempotencyKey)),
        )
        .limit(1);
      return row ? mapRow(row) : null;
    },

    async listDeliveries(orgId, query = {}) {
      const limit = Math.min(query.limit ?? 50, 200);
      const offset = query.offset ?? 0;
      const conditions = [eq(commsDeliveries.orgId, orgId)];
      if (query.status) {
        conditions.push(eq(commsDeliveries.status, query.status));
      }

      const rows = await db
        .select()
        .from(commsDeliveries)
        .where(and(...conditions))
        .orderBy(desc(commsDeliveries.createdAt))
        .limit(limit)
        .offset(offset);

      return rows.map(mapRow);
    },

    async findDeliveryByProviderMessageId(provider, providerMessageId) {
      const [row] = await db
        .select()
        .from(commsDeliveries)
        .where(
          and(
            eq(commsDeliveries.provider, provider),
            eq(commsDeliveries.providerMessageId, providerMessageId),
          ),
        )
        .orderBy(desc(commsDeliveries.createdAt))
        .limit(1);
      return row ? mapRow(row) : null;
    },

    async insertDeliveryEvent(input) {
      if (input.providerEventId) {
        const [existing] = await db
          .select()
          .from(commsDeliveryEvents)
          .where(eq(commsDeliveryEvents.providerEventId, input.providerEventId))
          .limit(1);
        if (existing) {
          return {
            row: {
              id: existing.id,
              orgId: existing.orgId,
              deliveryId: existing.deliveryId,
              eventType: existing.eventType,
              occurredAt: existing.occurredAt,
              providerEventId: existing.providerEventId,
              rawPayload: existing.rawPayload ?? {},
              createdAt: existing.createdAt,
            },
            duplicate: true,
          };
        }
      }

      const [row] = await db
        .insert(commsDeliveryEvents)
        .values({
          id: input.id,
          orgId: input.orgId,
          deliveryId: input.deliveryId,
          eventType: input.eventType,
          occurredAt: input.occurredAt,
          providerEventId: input.providerEventId ?? null,
          rawPayload: input.rawPayload ?? {},
        })
        .returning();
      if (!row) throw new Error("Failed to insert comms delivery event");
      return {
        row: {
          id: row.id,
          orgId: row.orgId,
          deliveryId: row.deliveryId,
          eventType: row.eventType,
          occurredAt: row.occurredAt,
          providerEventId: row.providerEventId,
          rawPayload: row.rawPayload ?? {},
          createdAt: row.createdAt,
        },
        duplicate: false,
      };
    },

    async listDeliveryEventsForDeliveries(deliveryIds) {
      if (deliveryIds.length === 0) return [];
      const rows = await db
        .select()
        .from(commsDeliveryEvents)
        .where(inArray(commsDeliveryEvents.deliveryId, deliveryIds))
        .orderBy(commsDeliveryEvents.occurredAt);
      return rows.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        deliveryId: row.deliveryId,
        eventType: row.eventType,
        occurredAt: row.occurredAt,
        providerEventId: row.providerEventId,
        rawPayload: row.rawPayload ?? {},
        createdAt: row.createdAt,
      }));
    },

    async getPreferences(orgId, userId) {
      const [row] = await db
        .select()
        .from(notificationPreferences)
        .where(
          and(eq(notificationPreferences.orgId, orgId), eq(notificationPreferences.userId, userId)),
        )
        .limit(1);

      if (row) {
        return {
          orgId: row.orgId,
          userId: row.userId,
          preferences: normalizeNotificationPreferences(row.preferences),
          updatedAt: row.updatedAt,
        };
      }

      return {
        orgId,
        userId,
        preferences: structuredClone(DEFAULT_NOTIFICATION_PREFERENCES),
        updatedAt: new Date(),
      };
    },

    async upsertPreferences(orgId, userId, patch) {
      const existing = await this.getPreferences(orgId, userId);
      const nextPreferences = mergeNotificationPreferences(existing.preferences, patch);
      const updatedAt = new Date();

      await db
        .insert(notificationPreferences)
        .values({
          orgId,
          userId,
          preferences: nextPreferences,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [notificationPreferences.orgId, notificationPreferences.userId],
          set: {
            preferences: nextPreferences,
            updatedAt,
          },
        });

      return {
        orgId,
        userId,
        preferences: nextPreferences,
        updatedAt,
      };
    },

    async insertInboxItem(input) {
      const [row] = await db
        .insert(commsInboxItems)
        .values({
          id: input.id,
          orgId: input.orgId,
          userId: input.userId,
          title: input.title,
          body: input.body,
          trigger: input.trigger ?? null,
          metadata: input.metadata ?? {},
          readAt: input.readAt ?? null,
        })
        .returning();
      if (!row) throw new Error("Failed to insert inbox item");
      return {
        id: row.id,
        orgId: row.orgId,
        userId: row.userId,
        title: row.title,
        body: row.body,
        trigger: row.trigger,
        metadata: row.metadata ?? {},
        readAt: row.readAt,
        createdAt: row.createdAt,
      };
    },

    async listInboxItems(orgId, userId, query = {}) {
      const limit = Math.min(query.limit ?? 50, 200);
      const offset = query.offset ?? 0;
      const conditions = [eq(commsInboxItems.orgId, orgId), eq(commsInboxItems.userId, userId)];
      if (query.unreadOnly) {
        conditions.push(isNull(commsInboxItems.readAt));
      }

      const rows = await db
        .select()
        .from(commsInboxItems)
        .where(and(...conditions))
        .orderBy(desc(commsInboxItems.createdAt))
        .limit(limit)
        .offset(offset);

      return rows.map((row) => ({
        id: row.id,
        orgId: row.orgId,
        userId: row.userId,
        title: row.title,
        body: row.body,
        trigger: row.trigger,
        metadata: row.metadata ?? {},
        readAt: row.readAt,
        createdAt: row.createdAt,
      }));
    },

    async markInboxRead(orgId, userId, itemId) {
      const [row] = await db
        .update(commsInboxItems)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(commsInboxItems.orgId, orgId),
            eq(commsInboxItems.userId, userId),
            eq(commsInboxItems.id, itemId),
          ),
        )
        .returning();
      if (!row) return null;
      return {
        id: row.id,
        orgId: row.orgId,
        userId: row.userId,
        title: row.title,
        body: row.body,
        trigger: row.trigger,
        metadata: row.metadata ?? {},
        readAt: row.readAt,
        createdAt: row.createdAt,
      };
    },
  };
}

export function toInboxItemDTO(row: CommsInboxItemRow) {
  return { ...row };
}

export function toDeliveryEventDTO(row: CommsDeliveryEventRow): CommsDeliveryEventDTO {
  return {
    id: row.id,
    deliveryId: row.deliveryId,
    eventType: row.eventType,
    occurredAt: row.occurredAt,
  };
}

export function toDeliveryDTO(
  row: CommsDeliveryRow,
  events?: CommsDeliveryEventDTO[],
): CommsDeliveryDTO {
  return events ? { ...row, events } : { ...row };
}
