/**
 * Connection options derived from `REDIS_URL`.
 *
 * This previously read only `hostname`, `port` and `password`, silently discarding the rest of the
 * URL. Three of those omissions are not cosmetic:
 *
 * - **`rediss://` was treated as plaintext.** A managed Redis that requires TLS would be dialled
 *   without it — failing to connect at best, and carrying credentials and traffic in the clear at
 *   worst.
 * - **An ACL `username` was dropped.** Redis 6+ authenticates `user:password`, so an ACL user would
 *   authenticate as `default` or fail outright.
 * - **A database index in the path was dropped.** `redis://host/2` silently became db 0. With more
 *   than one application on one Redis instance that is cross-talk between datasets, not a slow
 *   query — and it is invisible, because every client looks connected.
 *
 * `maxRetriesPerRequest` is `null` **deliberately**, not by omission: BullMQ refuses to construct a
 * queue or worker unless it is null for the connection it owns, and most callers here are queues and
 * workers. The consequence is that ioredis queues commands while the connection is down rather than
 * failing them — which is exactly why the socket-level fan-out publishes in `redis-fanout.ts` are
 * bounded by a timeout instead of being awaited indefinitely.
 */

export type RedisConnectionOptions = {
  host: string;
  port: number;
  username?: string;
  password?: string;
  db?: number;
  /** Present only for `rediss://` (or `?tls=true`); its presence enables TLS in ioredis. */
  tls?: Record<string, never>;
  maxRetriesPerRequest: null;
};

const DEFAULT_PORT = 6379;

/** Percent-decoded, or `undefined` when the component is absent (an empty user is "not set"). */
function decodeComponent(value: string): string | undefined {
  if (!value) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    // A malformed escape is still a usable literal; refusing to start would be worse than a
    // credential that fails to authenticate loudly.
    return value;
  }
}

function parseDatabase(pathname: string, searchParams: URLSearchParams): number | undefined {
  const fromPath = pathname.replace(/^\//, "").trim();
  const raw = fromPath !== "" ? fromPath : (searchParams.get("db") ?? "");
  if (raw === "") return undefined;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`REDIS_URL has an invalid database index: "${raw}"`);
  }
  return parsed;
}

function isTlsRequested(protocol: string, searchParams: URLSearchParams): boolean {
  if (protocol === "rediss:") return true;
  const flag = searchParams.get("tls")?.toLowerCase();
  return flag === "true" || flag === "1";
}

export function getRedisConnection(): RedisConnectionOptions {
  const redisUrl = process.env.REDIS_URL || `redis://localhost:${DEFAULT_PORT}`;

  let parsed: URL;
  try {
    parsed = new URL(redisUrl);
  } catch {
    // Never fall back to a default host here: silently connecting to localhost in production because
    // REDIS_URL was mistyped would look healthy while talking to the wrong server.
    throw new Error("REDIS_URL is not a valid URL");
  }

  if (parsed.protocol !== "redis:" && parsed.protocol !== "rediss:") {
    throw new Error(
      `REDIS_URL must use the redis:// or rediss:// scheme, received "${parsed.protocol}"`,
    );
  }

  const options: RedisConnectionOptions = {
    host: parsed.hostname || "localhost",
    port: Number(parsed.port) || DEFAULT_PORT,
    maxRetriesPerRequest: null,
  };

  const username = decodeComponent(parsed.username);
  if (username !== undefined) options.username = username;

  const password = decodeComponent(parsed.password);
  if (password !== undefined) options.password = password;

  const db = parseDatabase(parsed.pathname, parsed.searchParams);
  if (db !== undefined) options.db = db;

  if (isTlsRequested(parsed.protocol, parsed.searchParams)) options.tls = {};

  return options;
}
