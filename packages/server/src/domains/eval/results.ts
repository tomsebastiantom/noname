import Redis from "ioredis";
import { getRedisConnection } from "../../shared/redis";

/**
 * Eval result store — content-addressed results for reuse.
 *
 * The store is deliberately eval-owned: no release, tenant or gate table is involved. Only clean passes are
 * written (the caller enforces that); the TTL bounds growth, and the key is the full input hash.
 */
export type EvalResultStore = {
  get(key: string): Promise<unknown | null>;
  put(key: string, value: unknown): Promise<void>;
};

const PREFIX = "eval:result:";
const TTL_SECONDS = 7 * 24 * 60 * 60;

export function createEvalResultStore(): EvalResultStore {
  const redis = new Redis(getRedisConnection());

  return {
    async get(key) {
      const raw = await redis.get(`${PREFIX}${key}`);
      return raw ? (JSON.parse(raw) as unknown) : null;
    },
    async put(key, value) {
      await redis.set(`${PREFIX}${key}`, JSON.stringify(value), "EX", TTL_SECONDS);
    },
  };
}
