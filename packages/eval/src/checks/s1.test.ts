import { describe, expect, it } from "vitest";
import type { BrowserObserver, CheckContext, EgressProbe, EvalClient } from "../types";
import { browserChecks } from "./browser";

const egressCheck = browserChecks.filter((check) => check.meta.id === "S1.no_internal_egress");

const client: EvalClient = {
  async getJson() {
    return { ok: false as const, status: 404, error: "unused" };
  },
};

function browserWith(probe: (targets: string[]) => Promise<EgressProbe[]>): BrowserObserver {
  return {
    async visit() {
      return {
        url: "http://yogastore.test/",
        status: 200,
        title: "Noname",
        width: 1280,
        textLength: 200,
        text: "rendered",
        sample: "rendered",
        nodesByType: {},
        consoleErrors: [],
      };
    },
    probeEgress: probe,
    async close() {},
  };
}

function context(browser?: BrowserObserver): CheckContext {
  return {
    client,
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions: false,
    browser,
    siteBase: browser ? "http://yogastore.test" : undefined,
  };
}

async function run(browser?: BrowserObserver) {
  const { evaluateChecks } = await import("../index");
  return evaluateChecks(egressCheck, context(browser));
}

describe("S1.no_internal_egress", () => {
  it("passes when no internal target is reachable", async () => {
    const result = await run(
      browserWith(async (targets) => targets.map((target) => ({ target, reachable: false }))),
    );

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "S1.no_internal_egress", status: "pass" });
  });

  it("fails at warn level when an internal target is reachable", async () => {
    const result = await run(
      browserWith(async (targets) =>
        targets.map((target) => ({ target, reachable: target.includes(":3000") })),
      ),
    );

    expect(result.passed).toBe(true); // warn does not block
    expect(result.checks[0]).toMatchObject({
      id: "S1.no_internal_egress",
      status: "fail",
      level: "warn",
    });
    expect(result.checks[0]?.detail).toContain("127.0.0.1:3000");
  });

  it("skips — never passes — when the probe fails", async () => {
    const result = await run(
      browserWith(async () => {
        throw new Error("navigation failed");
      }),
    );

    expect(result.checks[0]).toMatchObject({ id: "S1.no_internal_egress", status: "skip" });
  });

  it("skips when the observer cannot probe egress", async () => {
    const result = await run({
      async visit() {
        throw new Error("unused");
      },
      async close() {},
    });

    expect(result.checks[0]).toMatchObject({ id: "S1.no_internal_egress", status: "skip" });
  });

  it("skips without a browser", async () => {
    const result = await run();

    expect(result.checks[0]).toMatchObject({ id: "S1.no_internal_egress", status: "skip" });
  });
});
