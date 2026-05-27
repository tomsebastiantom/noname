import { Queue, Worker } from "bullmq";

const connection = { host: process.env.REDIS_HOST || "localhost", port: Number(process.env.REDIS_PORT) || 6379 };

type EventHandler = (payload: unknown) => Promise<void>;

const handlers = new Map<string, EventHandler[]>();

export const eventBus = {
  publish: (event: string, payload: unknown) => {
    const queue = new Queue(event, { connection });
    return queue.add(event, payload);
  },
  subscribe: (event: string, handler: EventHandler) => {
    const existing = handlers.get(event) || [];
    existing.push(handler);
    handlers.set(event, existing);
    new Worker(event, async (job) => {
      for (const h of existing) await h(job.data);
    }, { connection });
  },
};
