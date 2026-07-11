import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as documentSchema from "./domains/documents/schema";
import * as machineSchema from "./domains/machines/schema";
import * as contextSchema from "./domains/context/schema";
import * as flagsSchema from "./domains/flags/schema";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString: string) {
  const client = postgres(connectionString, { max: 10 });
  return drizzle(client, {
    schema: { ...documentSchema, ...machineSchema, ...contextSchema, ...flagsSchema },
  });
}
