import "dotenv/config";
import { startTracing } from "./tracing";

startTracing();

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createAgentDomain } from "./domains/agent";
import { createAuthDomain } from "./domains/auth";
import { createAIPipelineDomain } from "./domains/ai-pipeline";
import { createAnalyticsDomain } from "./domains/analytics";
import { createContextDomain } from "./domains/context";
import { createDocumentsDomain } from "./domains/documents";
import { createEdgeDomain } from "./domains/edge";
import { createFlagDomain } from "./domains/flags";
import { createMachineDomain } from "./domains/machines";
import { createTenantDomain } from "./domains/tenant";
import { createDatabase } from "./drizzle";
import { orgMiddleware } from "./shared/org";

const app = new Hono();

app.use("*", orgMiddleware);
app.get("/health", (c) => c.json({ status: "ok", version: "0.0.1" }));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required (Postgres). Start Postgres via Docker: `docker compose up postgres`.",
  );
}
const db = createDatabase(databaseUrl);

const docs = createDocumentsDomain({ db });
app.route("/api/documents", docs.routes);

const ctx = createContextDomain({ db });
app.route("/api/context", ctx.routes);

app.route("/api/machines", createMachineDomain({ db }).routes);

const flags = createFlagDomain({ db });
app.route("/api/flags", flags.routes);

const analytics = await createAnalyticsDomain();
app.route("/api/analytics", analytics.routes);

const aiPipeline = createAIPipelineDomain();
app.route("/api/ai", aiPipeline.routes);

const agent = createAgentDomain({
  db,
  executor: {
    async execute(orgId, type, prompt, input) {
      switch (type) {
        case "generate_layout": {
          const r = await aiPipeline.pipeline.generateLayout(orgId, prompt, input);
          return {
            output: r.response as Record<string, unknown>,
            model: r.model,
            tokens: r.tokens,
          };
        }
        case "generate_content": {
          const r = await aiPipeline.pipeline.generateContent(orgId, "content", prompt);
          return {
            output: r.response as Record<string, unknown>,
            model: r.model,
            tokens: r.tokens,
          };
        }
        case "generate_machine": {
          const r = await aiPipeline.pipeline.generateMachine(orgId, type, prompt);
          return {
            output: r.response as Record<string, unknown>,
            model: r.model,
            tokens: r.tokens,
          };
        }
        case "analyze_analytics":
          return { output: { insights: [] }, model: "mock", tokens: 0 };
        default:
          return { output: {}, model: "mock", tokens: 0 };
      }
    },
  },
});
app.route("/api/agents", agent.routes);

const edge = createEdgeDomain({
  layout: docs.service.layout,
  context: ctx.engine,
  flags: flags.service,
});
app.route("/api/edge", edge.routes);

const tenant = createTenantDomain();
app.route("/api/tenants", tenant.routes);

const auth = createAuthDomain();
app.route("/api/tenants", auth.routes);

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Server running at http://localhost:${port}`);

export default app;
