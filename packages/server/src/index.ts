import "dotenv/config";
import { startTracing } from "./tracing";

startTracing();

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createAgentDomain } from "./domains/agent";
import { createCompositeAgentExecutor } from "./domains/agent/composite-executor";
import { createLegacyAgentExecutor } from "./domains/agent/legacy-executor";
import { createMastraExecutor } from "./domains/agent/mastra/executor";
import { parseTaskNotify, taskNotifyVariables } from "./domains/agent/task-notify";
import { createAIPipelineDomain } from "./domains/ai-pipeline";
import { createAnalyticsDomain } from "./domains/analytics";
import { createAuthDomain, createAuthorization } from "./domains/auth";
import { createContextDomain } from "./domains/context";
import { createDocumentsDomain } from "./domains/documents";
import { createPostgresDocumentStorage } from "./domains/documents/adapters/postgres";
import { createEdgeDomain } from "./domains/edge";
import { createFlagDomain } from "./domains/flags";
import { createIntegrationsDomain } from "./domains/integrations";
import { createMachineDomain } from "./domains/machines";
import { createNotificationsDomain, parseTransitionNotify } from "./domains/notifications";
import { createSecretsDomain } from "./domains/secrets";
import { createTenantDomain } from "./domains/tenant";
import { createWebhooksDomain, registerWebhookInboundRouter, registerWebhookOutboundRouter } from "./domains/webhooks";
import { createDatabase } from "./drizzle";
import { handleDomainError } from "./shared/error-handler";
import { eventBus, initEventBus } from "./shared/event-bus";
import { orgMiddleware } from "./shared/org";
import { orgTracingMiddleware } from "./shared/org-tracing";
import { initSseManager } from "./shared/sse-manager";

initEventBus();
initSseManager();

const app = new Hono();

app.use("*", orgMiddleware);
app.use("*", orgTracingMiddleware);

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

const authorization = createAuthorization();

const docs = createDocumentsDomain({
  db,
  storage,
  authorization,
  onContentPublished: async (orgId, type, id) => {
    if (onAuthProviderPublished) {
      await onAuthProviderPublished(orgId, type, id);
    }
  },
});

const auth = createAuthDomain({
  db,
  tenantSettings: docs.service.tenantSettings,
  assets: docs.service.assets,
  content: docs.service.content,
  storage,
});
onAuthProviderPublished = auth.onAuthProviderPublished;

const secrets = createSecretsDomain({
  tenantSettings: docs.service.tenantSettings,
});

const integrations = createIntegrationsDomain({
  secrets: secrets.service,
  tenantSettings: docs.service.tenantSettings,
});

const notifications = createNotificationsDomain({
  db,
  secrets: secrets.service,
  content: docs.service.content,
  tenantSettings: docs.service.tenantSettings,
});

const machines = createMachineDomain({
  db,
  hooks: {
    async onTransitionComplete({ orgId, params }) {
      const notify = parseTransitionNotify(params);
      if (!notify) return;
      await notifications.service.notify(orgId, notify);
    },
  },
});

const webhooks = createWebhooksDomain({
  db,
  secrets: secrets.service,
  tenantSettings: docs.service.tenantSettings,
});

registerWebhookInboundRouter({
  machines: machines.engine,
  subscribe: (event, handler) => {
    eventBus.subscribe(event, handler);
  },
});

registerWebhookOutboundRouter({
  webhooks: webhooks.service,
  subscribe: (event, handler) => {
    eventBus.subscribe(event, handler);
  },
});

app.route("/api/documents", docs.routes);

const ctx = createContextDomain({ db });
app.route("/api/context", ctx.routes);

app.route("/api/machines", machines.routes);

const flags = createFlagDomain({ db });
app.route("/api/flags", flags.routes);

const analytics = await createAnalyticsDomain();
app.route("/api/analytics", analytics.routes);

const aiPipeline = createAIPipelineDomain({ db, secrets: secrets.service });
app.route("/api/ai", aiPipeline.routes);

const agentExecutor = createCompositeAgentExecutor({
  legacy: createLegacyAgentExecutor({
    aiPipeline: aiPipeline.service,
    analytics: analytics.service,
  }),
  mastra: createMastraExecutor({
    analytics: analytics.service,
    integrations: integrations.service,
    aiPipeline: aiPipeline.service,
    layout: docs.service.layout,
    content: docs.service.content,
  }),
});

const agent = createAgentDomain({
  db,
  authorization,
  executor: agentExecutor,
  workerHooks: {
    async onTaskCompleted({ orgId, type, prompt, input, output }) {
      const notify = parseTaskNotify(input);
      if (!notify) return;

      const templateId = notify.templateId ?? "agent-task-complete";
      await notifications.service.notify(orgId, {
        trigger: templateId,
        to: notify.to,
        userId: notify.userId,
        variables: taskNotifyVariables(type, prompt, output, notify),
        idempotencyKey: notify.userId ? `agent-task:${type}:${notify.userId}` : undefined,
      });
    },
  },
});
app.route("/api/agents", agent.routes);

const edge = createEdgeDomain({
  layout: docs.service.layout,
  content: docs.service.content,
  tenantSettings: docs.service.tenantSettings,
  pages: docs.service.pages,
  context: ctx.service,
  flags: flags.service,
});
app.route("/api/edge", edge.routes);

const tenant = createTenantDomain({ tenantSettings: docs.service.tenantSettings });
app.route("/api/tenants", tenant.routes);

app.route("/api/auth", auth.routes);
app.route("/api/integrations", integrations.routes);
app.route("/api/notifications", notifications.routes);
app.route("/api/webhooks", webhooks.routes);

const port = Number(process.env.PORT) || 3000;
serve({ fetch: app.fetch, port });
console.log(`Server running at http://localhost:${port}`);

export default app;
export { notifications, webhooks };
