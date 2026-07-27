import "dotenv/config";
import { startTracing } from "./tracing";

startTracing();

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createAgentDomain } from "./domains/agent";
import { createAIPipelineDomain } from "./domains/ai-pipeline";
import { createAnalyticsDomain } from "./domains/analytics";
import { createAuthDomain } from "./domains/auth";
import { createContextDomain } from "./domains/context";
import { createDocumentsDomain } from "./domains/documents";
import { createPostgresDocumentStorage } from "./domains/documents/adapters/postgres";
import { createEdgeDomain } from "./domains/edge";
import { createFlagDomain } from "./domains/flags";
import { createMachineDomain } from "./domains/machines";
import { createTenantDomain } from "./domains/tenant";
import { createDatabase } from "./drizzle";
import { handleDomainError } from "./shared/error-handler";
import { orgMiddleware } from "./shared/org";

const app = new Hono();

app.use("*", orgMiddleware);

app.onError((err, c) => {
  const handled = handleDomainError(err, c);
  if (handled) return handled;
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});
app.get("/health", (c) => c.json({ status: "ok", version: "0.0.1" }));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    "DATABASE_URL is required (Postgres). Start Postgres via Docker: `docker compose up postgres`.",
  );
}
const db = createDatabase(databaseUrl);
const storage = createPostgresDocumentStorage(db);

let onAuthProviderPublished: ((orgId: string, type: string, id: string) => Promise<void>) | null =
  null;

const docs = createDocumentsDomain({
  db,
  storage,
  onContentPublished: async (orgId, type, id) => {
    if (onAuthProviderPublished) {
      await onAuthProviderPublished(orgId, type, id);
    }
  },
});

const auth = createAuthDomain({
  tenantSettings: docs.service.tenantSettings,
  assets: docs.service.assets,
  content: docs.service.content,
  storage,
});
onAuthProviderPublished = auth.onAuthProviderPublished;

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
  content: docs.service.content,
  tenantSettings: docs.service.tenantSettings,
  pages: docs.service.pages,
  context: ctx.engine,
  flags: flags.service,
});
app.route("/api/edge", edge.routes);

const tenant = createTenantDomain({ tenantSettings: docs.service.tenantSettings });
app.route("/api/tenants", tenant.routes);

app.route("/api/tenants", auth.routes);

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Server running at http://localhost:${port}`);

export default app;
