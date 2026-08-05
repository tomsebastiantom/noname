import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import type { CommsDeliveryDTO, ListDeliveriesQuery } from "../ports";
import { commsDeliveries, notificationPreferences } from "../schema";

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
  agentTaskEmail: boolean;
  marketingEmail: boolean;
  updatedAt: Date;
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
      Pick<
        CommsDeliveryRow,
        "status" | "providerMessageId" | "error" | "sentAt" | "attemptCount"
      >
    >,
  ): Promise<void>;
  findDelivery(orgId: string, id: string): Promise<CommsDeliveryRow | null>;
  findDeliveryByIdempotency(
    orgId: string,
    idempotencyKey: string,
  ): Promise<CommsDeliveryRow | null>;
  listDeliveries(orgId: string, query?: ListDeliveriesQuery): Promise<CommsDeliveryRow[]>;
  getPreferences(orgId: string, userId: string): Promise<NotificationPreferencesRow>;
  upsertPreferences(
    orgId: string,
    userId: string,
    patch: Partial<Pick<NotificationPreferencesRow, "agentTaskEmail" | "marketingEmail">>,
  ): Promise<NotificationPreferencesRow>;
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
          and(
            eq(commsDeliveries.orgId, orgId),
            eq(commsDeliveries.idempotencyKey, idempotencyKey),
          ),
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
          agentTaskEmail: row.agentTaskEmail,
          marketingEmail: row.marketingEmail,
          updatedAt: row.updatedAt,
        };
      }

      return {
        orgId,
        userId,
        agentTaskEmail: true,
        marketingEmail: false,
        updatedAt: new Date(),
      };
    },

    async upsertPreferences(orgId, userId, patch) {
      const existing = await this.getPreferences(orgId, userId);
      const next = {
        orgId,
        userId,
        agentTaskEmail: patch.agentTaskEmail ?? existing.agentTaskEmail,
        marketingEmail: patch.marketingEmail ?? existing.marketingEmail,
        updatedAt: new Date(),
      };

      await db
        .insert(notificationPreferences)
        .values(next)
        .onConflictDoUpdate({
          target: [notificationPreferences.orgId, notificationPreferences.userId],
          set: {
            agentTaskEmail: next.agentTaskEmail,
            marketingEmail: next.marketingEmail,
            updatedAt: next.updatedAt,
          },
        });

      return next;
    },
  };
}

export function toDeliveryDTO(row: CommsDeliveryRow): CommsDeliveryDTO {
  return { ...row };
}
