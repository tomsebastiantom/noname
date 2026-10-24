import {
  index,
  json,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const capabilityIdempotency = pgTable(
  "capability_idempotency",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id").notNull().defaultRandom(),
    orgId: text("org_id").notNull(),
    capability: text("capability").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status").notNull(),
    /**
     * Stored as `json`, not `jsonb`, so a replayed command returns byte-identical JSON.
     *
     * `jsonb` canonicalises key order (and normalises some numeric forms), so the replay of an identical
     * request produced a body with keys in a different order than the live response — a non-difference
     * that any client hashing or comparing bodies would treat as a change. The IETF
     * Idempotency-Key draft says a duplicate SHOULD be answered with "the result of the previously
     * completed operation", so the safest reading is that the result is returned as produced. Nothing
     * queries inside this column, so `jsonb`'s indexing advantages buy nothing here.
     */
    result: json("result").$type<unknown>(),
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
