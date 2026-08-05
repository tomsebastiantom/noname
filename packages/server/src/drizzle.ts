import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as agentSchema from "./domains/agent/schema";
import * as aiPipelineSchema from "./domains/ai-pipeline/schema";
import * as contextSchema from "./domains/context/schema";
import * as documentSchema from "./domains/documents/schema";
import * as flagsSchema from "./domains/flags/schema";
import * as machineSchema from "./domains/machines/schema";
import * as notificationsSchema from "./domains/notifications/schema";
import * as webhooksSchema from "./domains/webhooks/schema";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, {
    schema: {
      ...documentSchema,
      ...machineSchema,
      ...contextSchema,
      ...flagsSchema,
      ...agentSchema,
      ...aiPipelineSchema,
      ...notificationsSchema,
      ...webhooksSchema,
    },
  });
}
