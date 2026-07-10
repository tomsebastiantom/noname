import { Hono } from "hono";
import { createContentRoutes } from "./domains/content/api";
import { validator as contentValidator } from "./domains/content/adapters/postgres";
import { createContextRoutes } from "./domains/context/api";
import { createAIPipelineRoutes } from "./domains/ai-pipeline/api";
import { createMachineRoutes } from "./domains/machines/api";
import { createEdgeRoutes } from "./domains/edge/api";
import { specRoutes } from "./domains/spec/api";
import { agentRoutes } from "./domains/agent/api";
import { registerAnalyticsListeners } from "./domains/analytics/events";
import type { ContentStorage, ContentEntryDTO } from "./domains/content/ports";

const app = new Hono();

registerAnalyticsListeners();

app.get("/health", (c) => c.json({ status: "ok", version: "0.0.1" }));

const contentStorage = createMockStorage();
app.route("/api/content", createContentRoutes(contentStorage, contentValidator));
app.route("/api/context", createContextRoutes(null));
app.route("/api/ai", createAIPipelineRoutes(null));
app.route("/api/machines", createMachineRoutes());
app.route("/api/edge", createEdgeRoutes());
app.route("/api/spec", specRoutes);
app.route("/api/agents", agentRoutes);

export default app;

function createMockStorage(): ContentStorage {
  const store = new Map<string, unknown[]>();
  return {
    create: async (tid, type, slug, data): Promise<ContentEntryDTO> => {
      const key = `${tid}:${type}`;
      const existing = (store.get(key) || []) as ContentEntryDTO[];
      const now = new Date();
      const entry: ContentEntryDTO = {
        id: crypto.randomUUID(),
        tenantId: tid,
        type,
        slug,
        data,
        status: "draft",
        meta: {},
        createdAt: now,
        updatedAt: now,
      };
      existing.push(entry);
      store.set(key, existing);
      return entry;
    },
    findByType: async (tid, type) => (store.get(`${tid}:${type}`) || []) as ContentEntryDTO[],
    findBySlug: async (tid, type, slug) => {
      const entries = (store.get(`${tid}:${type}`) || []) as ContentEntryDTO[];
      const found = entries.find((e) => e.slug === slug);
      return found ?? null;
    },
    update: async (tid, type, slug, data): Promise<ContentEntryDTO> => {
      const entries = (store.get(`${tid}:${type}`) || []) as ContentEntryDTO[];
      const idx = entries.findIndex((e) => e.slug === slug);
      if (idx === -1) throw new Error("not found");
      const existing = entries[idx]!;
      const now = new Date();
      const updated: ContentEntryDTO = {
        id: existing.id,
        tenantId: existing.tenantId,
        type: existing.type,
        slug: existing.slug,
        data,
        status: existing.status,
        meta: existing.meta,
        createdAt: existing.createdAt,
        updatedAt: now,
      };
      entries[idx] = updated;
      return updated;
    },
    delete: async (tid, type, slug) => {
      const entries = (store.get(`${tid}:${type}`) || []) as ContentEntryDTO[];
      const idx = entries.findIndex((e) => e.slug === slug);
      if (idx !== -1) entries.splice(idx, 1);
    },
  };
}