import { describe, expect, it } from "vitest";
import type { CheckCache } from "./cache";
import { evaluateChecks } from "./index";
import type { Check, CheckContext, CheckResult, EvalClient } from "./types";

const client: EvalClient = {
  async getJson() {
    return { ok: false as const, status: 404, error: "unused" };
  },
};

function context(cache: CheckCache | null): CheckContext {
  return {
    client,
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions: false,
    cacheBaseKey: "base",
    routeHashes: { "/": "home-hash" },
    checkCache: cache ?? undefined,
  };
}

function homeCheck(id: string, calls: { count: number }): Check {
  return {
    meta: {
      id,
      tier: 2,
      defaultLevel: "error",
      needs: [],
      emits: [id],
      retryable: true,
      scope: "home",
      description: "fixture",
    },
    async run() {
      calls.count += 1;
      return [{ id, status: "pass", level: "error", detail: "rendered" }];
    },
  };
}

function memoryCache(seed?: Record<string, CheckResult[]>): CheckCache & { writes: string[] } {
  const store = new Map(Object.entries(seed ?? {}));
  const writes: string[] = [];
  return {
    writes,
    async get(key: string): Promise<CheckResult[] | null> {
      return store.get(key) ?? null;
    },
    async put(key: string, results: CheckResult[]): Promise<void> {
      writes.push(key);
      store.set(key, results);
    },
  };
}

describe("per-check home cache", () => {
  it("reuses a cached pass instead of running the check", async () => {
    const calls = { count: 0 };
    const key = "base:home:home-hash:B1.render";
    const cache = memoryCache({
      [key]: [{ id: "B1.render", status: "pass", level: "error", detail: "cached" }],
    });

    const result = await evaluateChecks([homeCheck("B1.render", calls)], context(cache));

    expect(calls.count).toBe(0);
    expect(result.checks[0]).toMatchObject({ status: "pass", reused: true });
    expect(result.counts.reused).toBe(1);
  });

  it("runs and stores a clean pass on a miss", async () => {
    const calls = { count: 0 };
    const cache = memoryCache();

    const result = await evaluateChecks([homeCheck("B1.render", calls)], context(cache));

    expect(calls.count).toBe(1);
    expect(cache.writes).toContain("base:home:home-hash:B1.render");
    expect(result.counts.reused).toBe(0);
  });

  it("does not cache a failure", async () => {
    const cache = memoryCache();
    const check: Check = {
      meta: {
        id: "B1.render",
        tier: 2,
        defaultLevel: "error",
        needs: [],
        emits: ["B1.render"],
        retryable: true,
        scope: "home",
        description: "fixture",
      },
      async run() {
        return [{ id: "B1.render", status: "fail", level: "error", detail: "broken" }];
      },
    };

    await evaluateChecks([check], context(cache));
    expect(cache.writes).toHaveLength(0);
  });
});
