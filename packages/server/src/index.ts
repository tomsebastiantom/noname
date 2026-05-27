import { Hono } from "hono";
import { createContentRoutes } from "./domains/content/api";
import { createPostgresContentAdapter, validator } from "./domains/content/adapters/postgres";
import { specRoutes } from "./domains/spec/api";
import { agentRoutes } from "./domains/agent/api";
import { registerAnalyticsListeners } from "./domains/analytics/events";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

const app = new Hono();

registerAnalyticsListeners();

app.get("/health", (c) => c.json({ status: "ok", version: "0.0.1" }));

// Dependency injection: create storage, inject into routes
// DB initialized in Phase 1 — for now, routes handle mock/stub
// const db = drizzle(client);
// const contentStorage = createPostgresContentAdapter(db);
// app.route("/api/content", createContentRoutes(contentStorage, validator));

app.route("/api/content", createContentRoutes(mockStorage(), validator));
app.route("/api/spec", specRoutes);
app.route("/api/agents", agentRoutes);

export default app;

// Mock storage for Phase 0 — replaced with real Postgres in Phase 1
function mockStorage() {
  const store = new Map<string, unknown[]>();
  return {
    create: async (tid: string, type: string, slug: string, data: unknown) => {
      const key = `${tid}:${type}`;
      const existing = store.get(key) || [];
      const entry = { id: crypto.randomUUID(), tid, type, slug, data, created_at: new Date() };
      existing.push(entry);
      store.set(key, existing);
      return entry;
    },
    findByType: async (tid: string, type: string) => store.get(`${tid}:${type}`) || [],
    findBySlug: async (tid: string, type: string, slug: string) => {
      const entries = store.get(`${tid}:${type}`) || [];
      return (entries as any[]).find((e) => e.slug === slug) || null;
    },
    update: async (tid: string, type: string, slug: string, data: unknown) => {
      return { tid, type, slug, data };
    },
    delete: async (tid: string, type: string, slug: string) => {},
  };
}
