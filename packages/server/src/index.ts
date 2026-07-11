import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { createDocumentsDomain } from "./domains/documents";
import { createContextDomain } from "./domains/context";
import { createMachineDomain } from "./domains/machines";
import { createFlagDomain } from "./domains/flags";
import { createAIPipelineRoutes } from "./domains/ai-pipeline/api";
import { createEdgeRoutes } from "./domains/edge/api";
import { agentRoutes } from "./domains/agent/api";
import { registerAnalyticsListeners } from "./domains/analytics/events";
import { createDatabase } from "./drizzle";

const app = new Hono();

registerAnalyticsListeners();

app.get("/health", (c) => c.json({ status: "ok", version: "0.0.1" }));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required (Postgres). Start Postgres via Docker: `docker compose up postgres`.",
  );
}
const db = createDatabase(databaseUrl);

app.route("/api/documents", createDocumentsDomain({ db }).routes);
app.route("/api/context", createContextDomain({ db }).routes);
app.route("/api/machines", createMachineDomain({ db }).routes);
app.route("/api/flags", createFlagDomain({ db }).routes);

app.route("/api/ai", createAIPipelineRoutes(null));
app.route("/api/edge", createEdgeRoutes());
app.route("/api/agents", agentRoutes);

if (import.meta.url === `file://${process.argv[1]}`) {
  serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 });
}

export default app;
