import { describe, expect, it } from "vitest";
import type { BrowserObserver, CheckContext, EvalClient } from "../types";
import { browserChecks } from "./browser";

const designCheck = browserChecks.filter((check) => check.meta.id === "B6.design");

const client: EvalClient = {
  async getJson() {
    return { ok: false as const, status: 404, error: "unused" };
  },
};

function browserWith(
  contrast: Array<{ id: string; impact: string; nodes: number }> | undefined,
): BrowserObserver {
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
        contrast,
        consoleErrors: [],
      };
    },
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
  return evaluateChecks(designCheck, context(browser));
}

describe("B6.design", () => {
  it("passes when there are no contrast advisories", async () => {
    const result = await run(browserWith([]));

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "B6.design", status: "pass", level: "warn" });
  });

  it("reports a warning failure that does not block", async () => {
    const result = await run(browserWith([{ id: "color-contrast", impact: "serious", nodes: 3 }]));

    expect(result.passed).toBe(true); // warn never blocks
    expect(result.checks[0]).toMatchObject({ id: "B6.design", status: "fail", level: "warn" });
    expect(result.checks[0]?.detail).toContain("color-contrast (3 node(s))");
  });

  it("skips — never passes — when contrast could not be measured", async () => {
    const result = await run(browserWith(undefined));

    expect(result.checks[0]).toMatchObject({ id: "B6.design", status: "skip", level: "warn" });
  });

  it("skips without a browser", async () => {
    const result = await run();

    expect(result.checks[0]).toMatchObject({ id: "B6.design", status: "skip", level: "warn" });
  });
});
