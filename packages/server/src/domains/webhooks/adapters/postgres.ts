import { and, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import type { WebhookReceiptDTO } from "../ports";
import { webhookReceipts } from "../schema";

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
}

function mapRow(row: typeof webhookReceipts.$inferSelect): WebhookReceiptRow {
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
        if (!row) throw new Error("Failed to insert webhook receipt");
        return { row: mapRow(row), duplicate: false };
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
        return { row: mapRow(existing), duplicate: true };
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
      const [row] = await db.select().from(webhookReceipts).where(eq(webhookReceipts.id, id)).limit(1);
      return row ? mapRow(row) : null;
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
