import { type JobsOptions, Queue } from "bullmq";
import { getRedisConnection } from "./redis";

const queues = new Map<string, Queue<unknown>>();

export function getBullmqQueue<T>(
  queueName: string,
  options?: { defaultJobOptions?: JobsOptions },
): Queue<T> {
  const existing = queues.get(queueName) as Queue<T> | undefined;
  if (existing) return existing;

  const queue = new Queue<T>(queueName, {
    connection: getRedisConnection(),
    defaultJobOptions: options?.defaultJobOptions,
  });
  queues.set(queueName, queue as Queue<unknown>);
  return queue;
}

export async function closeBullmqQueue(queueName: string): Promise<void> {
  const queue = queues.get(queueName);
  if (!queue) return;
  await queue.close();
  queues.delete(queueName);
}
