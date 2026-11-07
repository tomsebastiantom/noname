import { describe, expect, it } from "vitest";
import { evaluateChecks } from "./index";
import type { Check, CheckContext, CheckResult, EvalClient } from "./types";

const client: EvalClient = {
  async getJson() {
    return { ok: false as const, status: 404, error: "unused" };
  },
};

function context(retries?: number): CheckContext {
  return {
    client,
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions: false,
    config: retries === undefined ? undefined : { retries },
  };
}

function check(
  id: string,
  options: { retryable?: boolean; outcomes: CheckResult["status"][] },
): Check {
  let call = 0;
  return {
    meta: {
      id,
      tier: 2,
      defaultLevel: "error",
      needs: [],
      emits: [id],
      retryable: options.retryable,
      description: "fixture",
    },
    async run() {
      const status = options.outcomes[Math.min(call, options.outcomes.length - 1)]!;
      call += 1;
      return [{ id, status, level: "error", detail: `attempt ${call}` }];
    },
  };
}

describe("retry policy", () => {
  it("retries a retryable failure once and records it as flaky", async () => {
    const result = await evaluateChecks(
      [check("X1.flaky", { retryable: true, outcomes: ["fail", "pass"] })],
      context(),
    );

    expect(result.passed).toBe(true);
    expect(result.counts.flaky).toBe(1);
    expect(result.checks[0]).toMatchObject({ status: "pass", attempts: 2 });
  });

  it("does not retry a check that is not retryable", async () => {
    const result = await evaluateChecks(
      [check("X2.once", { retryable: false, outcomes: ["fail", "pass"] })],
      context(),
    );

    expect(result.passed).toBe(false);
    expect(result.counts.flaky).toBe(0);
    expect(result.checks[0]?.attempts).toBeUndefined();
  });

  it("stops after the configured retries", async () => {
    const result = await evaluateChecks(
      [check("X3.always", { retryable: true, outcomes: ["fail"] })],
      context(),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]).toMatchObject({ status: "fail", attempts: 2 });
    expect(result.counts.flaky).toBe(0);
  });

  it("honours retries: 0", async () => {
    const result = await evaluateChecks(
      [check("X4.none", { retryable: true, outcomes: ["fail", "pass"] })],
      context(0),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.attempts).toBeUndefined();
  });

  it("does not retry a skip", async () => {
    const result = await evaluateChecks(
      [check("X5.skip", { retryable: true, outcomes: ["skip"] })],
      context(),
    );

    expect(result.checks[0]).toMatchObject({ status: "skip" });
    expect(result.counts.flaky).toBe(0);
  });
});
