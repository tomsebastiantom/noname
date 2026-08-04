import { and, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
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
    input: Omit<CommsDeliveryRow, "createdAt" | "sentAt" | "providerMessageId" | "error"> & {
      providerMessageId?: string | null;
      error?: string | null;
      sentAt?: Date | null;
    },
  ): Promise<CommsDeliveryRow>;
  updateDelivery(
    id: string,
    patch: Partial<Pick<CommsDeliveryRow, "status" | "providerMessageId" | "error" | "sentAt">>,
  ): Promise<void>;
  getPreferences(orgId: string, userId: string): Promise<NotificationPreferencesRow>;
  upsertPreferences(
    orgId: string,
    userId: string,
    patch: Partial<Pick<NotificationPreferencesRow, "agentTaskEmail" | "marketingEmail">>,
  ): Promise<NotificationPreferencesRow>;
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
          sentAt: input.sentAt ?? null,
        })
        .returning();
      return row as CommsDeliveryRow;
    },

    async updateDelivery(id, patch) {
      const set: Record<string, unknown> = {};
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.providerMessageId !== undefined) set.providerMessageId = patch.providerMessageId;
      if (patch.error !== undefined) set.error = patch.error;
      if (patch.sentAt !== undefined) set.sentAt = patch.sentAt;
      if (Object.keys(set).length === 0) return;
      await db.update(commsDeliveries).set(set).where(eq(commsDeliveries.id, id));
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
