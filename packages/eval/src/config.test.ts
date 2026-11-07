import { describe, expect, it } from "vitest";
import { resolveLevel } from "./config";
import { evaluateChecks } from "./index";
import type { AssertionConfig, Check, CheckContext, CheckResult, EvalClient } from "./types";

const client: EvalClient = {
  async getJson() {
    return { ok: false as const, status: 404, error: "unused" };
  },
};

function context(config?: AssertionConfig, runId?: string): CheckContext {
  return {
    client,
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions: false,
    config,
    runId,
  };
}

function fixed(results: CheckResult[]): Check {
  return {
    meta: {
      id: "X1.fixture",
      tier: 0,
      defaultLevel: "warn",
      needs: [],
      emits: results.map((result) => result.id),
      description: "fixture",
    },
    async run() {
      return results;
    },
  };
}

describe("resolveLevel", () => {
  it("uses the default when nothing is configured", () => {
    expect(resolveLevel("B2.overflow", "/", undefined, "warn")).toBe("warn");
  });

  it("applies a per-check assertion", () => {
    expect(
      resolveLevel("B2.overflow", "/", { assertions: { "B2.overflow": "error" } }, "warn"),
    ).toBe("error");
  });

  it("applies the last matching matrix entry", () => {
    const config: AssertionConfig = {
      assertMatrix: [
        { matchingRoute: "^/", assertions: { "B2.overflow": "error" } },
        { matchingRoute: "^/legal", assertions: { "B2.overflow": "off" } },
      ],
    };
    expect(resolveLevel("B2.overflow", "/legal/terms", config, "warn")).toBe("off");
    expect(resolveLevel("B2.overflow", "/checkout", config, "warn")).toBe("error");
  });

  it("ignores a malformed pattern instead of crashing", () => {
    expect(
      resolveLevel(
        "B2.overflow",
        "/",
        { assertMatrix: [{ matchingRoute: "(", assertions: {} }] },
        "warn",
      ),
    ).toBe("warn");
  });
});

describe("evaluateChecks with assertion config", () => {
  const checks = fixed([
    { id: "B2.overflow", status: "fail", level: "warn", subject: "/legal", detail: "overflow" },
    { id: "B3.a11y", status: "fail", level: "error", subject: "/", detail: "alt" },
    { id: "B4.content", status: "skip", level: "error", subject: "/", detail: "no browser" },
  ]);

  it("drops off-level results and re-levels the rest", async () => {
    const result = await evaluateChecks(
      [checks],
      context({ assertions: { "B2.overflow": "off" } }),
    );

    expect(result.checks.map((check) => check.id)).toEqual(["B3.a11y", "B4.content"]);
    expect(result.passed).toBe(false); // B3 error fail
  });

  it("counts required skips as unverified", async () => {
    const result = await evaluateChecks([checks], context());

    expect(result.counts.unverified).toBe(1);
    expect(result.checks.find((check) => check.id === "B4.content")).toMatchObject({
      status: "skip",
      level: "error",
    });
  });

  it("is stable for the same config and changes when levels change", async () => {
    const a = await evaluateChecks([checks], context());
    const b = await evaluateChecks([checks], context());
    const c = await evaluateChecks([checks], context({ assertions: { "B2.overflow": "error" } }));

    expect(a.checksVersion).toBe(b.checksVersion);
    expect(c.checksVersion).not.toBe(a.checksVersion);
  });

  it("passes a caller-supplied run id through", async () => {
    const result = await evaluateChecks([checks], context(undefined, "run-123"));

    expect(result.runId).toBe("run-123");
  });
});
