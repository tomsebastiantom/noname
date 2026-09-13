import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const capabilityIdempotency = pgTable(
  "capability_idempotency",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    capability: text("capability").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status").notNull(),
    result: jsonb("result").$type<unknown>(),
    error: jsonb("error").$type<{ message: string; status?: number }>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [
    uniqueIndex("capability_idempotency_org_capability_key_idx").on(
      table.orgId,
      table.capability,
      table.idempotencyKey,
    ),
    index("capability_idempotency_expires_at_idx").on(table.expiresAt),
  ],
);
