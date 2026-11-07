import { describe, expect, it } from "vitest";
import type { BrowserObserver, CheckContext, EvalClient } from "../types";
import { browserChecks } from "./browser";

const a11yCheck = browserChecks.filter((check) => check.meta.id === "B3.a11y");

const client: EvalClient = {
  async getJson() {
    return { ok: false as const, status: 404, error: "unused" };
  },
};

function browserWith(
  a11y: Array<{ id: string; impact: string; nodes: number }> | undefined,
): BrowserObserver {
  return {
    async visit() {
      return {
        url: "http://yogastore.test/",
        status: 200,
        title: "Noname",
        width: 1280,
        textLength: 200,
        sample: "rendered",
        nodesByType: {},
        a11y,
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
  return evaluateChecks(a11yCheck, context(browser));
}

describe("B3.a11y", () => {
  it("passes when the rule set reports no violations", async () => {
    const result = await run(browserWith([]));

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "B3.a11y", status: "pass" });
  });

  it("fails and names the violated rules", async () => {
    const result = await run(
      browserWith([
        { id: "image-alt", impact: "critical", nodes: 2 },
        { id: "label", impact: "serious", nodes: 1 },
      ]),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.detail).toContain("image-alt (2 node(s))");
    expect(result.checks[0]?.detail).toContain("label (1 node(s))");
  });

  it("skips — never passes — when the audit could not run", async () => {
    const result = await run(browserWith(undefined));

    expect(result.checks[0]).toMatchObject({ id: "B3.a11y", status: "skip", level: "error" });
  });

  it("skips without a browser", async () => {
    const result = await run();

    expect(result.checks[0]).toMatchObject({ id: "B3.a11y", status: "skip", level: "error" });
  });
});
