import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/domains/documents/schema.ts",
    "./src/domains/collab/schema.ts",
    "./src/domains/machines/schema.ts",
    "./src/domains/context/schema.ts",
    "./src/domains/flags/schema.ts",
    "./src/domains/agent/schema.ts",
    "./src/domains/ai-pipeline/schema.ts",
    "./src/domains/notifications/schema.ts",
    "./src/domains/webhooks/schema.ts",
    "./src/domains/webhooks/inbound-schema.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://noname:noname_dev@localhost:5432/app",
  },
});
