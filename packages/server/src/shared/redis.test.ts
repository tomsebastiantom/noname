import { afterEach, describe, expect, it } from "vitest";
import { getRedisConnection } from "./redis";

/**
 * S9: this helper used to read only host, port and password from `REDIS_URL`, so `rediss://`, an ACL
 * username and a database index were all silently discarded. Each case below is one of those, plus
 * the deliberate `maxRetriesPerRequest: null` that BullMQ requires.
 */

const originalUrl = process.env.REDIS_URL;

afterEach(() => {
  if (originalUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = originalUrl;
});

function withUrl(url: string) {
  process.env.REDIS_URL = url;
  return getRedisConnection();
}

describe("redis connection from REDIS_URL", () => {
  it("defaults to localhost when REDIS_URL is unset", () => {
    delete process.env.REDIS_URL;
    expect(getRedisConnection()).toEqual({
      host: "localhost",
      port: 6379,
      maxRetriesPerRequest: null,
    });
  });

  it("enables TLS for rediss:// so a managed Redis is not dialled in the clear", () => {
    expect(withUrl("rediss://redis.example.com:6380").tls).toEqual({});
    expect(withUrl("rediss://redis.example.com:6380").port).toBe(6380);
  });

  it("does not enable TLS for plain redis://", () => {
    expect(withUrl("redis://redis.example.com:6379").tls).toBeUndefined();
  });

  it("honours ?tls=true even on a redis:// URL", () => {
    expect(withUrl("redis://redis.example.com:6379?tls=true").tls).toEqual({});
  });

  it("keeps an ACL username, percent-decoded", () => {
    const options = withUrl("redis://app%2Duser:s3cr3t@redis.example.com:6379");
    expect(options.username).toBe("app-user");
    expect(options.password).toBe("s3cr3t");
  });

  it("keeps the database index from the path (previously always db 0)", () => {
    expect(withUrl("redis://redis.example.com:6379/2").db).toBe(2);
    expect(withUrl("redis://redis.example.com:6379/0").db).toBe(0);
  });

  it("accepts the database index as a query parameter too", () => {
    expect(withUrl("redis://redis.example.com:6379?db=3").db).toBe(3);
  });

  it("omits db when the URL does not specify one", () => {
    expect(withUrl("redis://redis.example.com:6379").db).toBeUndefined();
  });

  it("combines scheme, credentials and database the way a managed instance needs", () => {
    expect(withUrl("rediss://app:pw@redis.example.com:6380/4")).toEqual({
      host: "redis.example.com",
      port: 6380,
      username: "app",
      password: "pw",
      db: 4,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });

  it("keeps maxRetriesPerRequest null, which BullMQ requires", () => {
    expect(withUrl("redis://redis.example.com:6379").maxRetriesPerRequest).toBeNull();
  });

  it("refuses a malformed URL instead of silently using localhost", () => {
    expect(() => withUrl("not a url")).toThrow(/not a valid URL/);
  });

  it("refuses a non-redis scheme instead of treating it as redis", () => {
    expect(() => withUrl("http://redis.example.com:6379")).toThrow(/redis:\/\/ or rediss:\/\//);
  });

  it("refuses an invalid database index", () => {
    expect(() => withUrl("redis://redis.example.com:6379/abc")).toThrow(/invalid database index/);
  });
});
