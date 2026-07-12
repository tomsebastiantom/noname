import { pgTable, uuid, text, jsonb, timestamp, integer } from "drizzle-orm/pg-core";

export const aiGenerations = pgTable("ai_generations", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  prompt: text("prompt").notNull(),
  response: jsonb("response").notNull(),
  model: text("model").notNull(),
  tokens: integer("tokens").notNull(),
  targetType: text("target_type").notNull(),
  created_at: timestamp("created_at").notNull().defaultNow(),
});
