type EventHandler = (payload: unknown) => Promise<void>;

const handlers = new Map<string, EventHandler[]>();

export const eventBus = {
  publish: async (event: string, payload: unknown) => {
    for (const h of handlers.get(event) || []) {
      try {
        await h(payload);
      } catch {
        /* fire-and-forget */
      }
    }
  },

  subscribe: (event: string, handler: EventHandler) => {
    const existing = handlers.get(event) || [];
    existing.push(handler);
    handlers.set(event, existing);
  },
};
