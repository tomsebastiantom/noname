import { describe, expect, it } from "vitest";
import type { BrowserObserver, CheckContext, EvalClient } from "../types";
import { browserChecks } from "./browser";

const overflowCheck = browserChecks.filter((check) => check.meta.id === "B2.overflow");

const client: EvalClient = {
  async getJson() {
    return { ok: false as const, status: 404, error: "unused" };
  },
};

function browserWith(
  overflowByWidth: Record<number, { scrollWidth: number; clientWidth: number }>,
): BrowserObserver {
  return {
    async visit(_path, options) {
      const width = options?.width ?? 1280;
      return {
        url: "http://yogastore.test/",
        status: 200,
        title: "Noname",
        width,
        textLength: 200,
        sample: "rendered",
        nodesByType: {},
        overflow: overflowByWidth[width],
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
  return evaluateChecks(overflowCheck, context(browser));
}

describe("B2.overflow", () => {
  it("passes when none of the widths overflow", async () => {
    const result = await run(
      browserWith({
        375: { scrollWidth: 375, clientWidth: 375 },
        768: { scrollWidth: 768, clientWidth: 768 },
        1440: { scrollWidth: 1440, clientWidth: 1440 },
      }),
    );

    expect(result.passed).toBe(true);
    expect(result.checks.every((check) => check.status === "pass")).toBe(true);
    expect(result.checks).toHaveLength(3);
  });

  it("fails only the width that overflows", async () => {
    const result = await run(
      browserWith({
        375: { scrollWidth: 420, clientWidth: 375 },
        768: { scrollWidth: 768, clientWidth: 768 },
        1440: { scrollWidth: 1440, clientWidth: 1440 },
      }),
    );

    expect(result.passed).toBe(false);
    const failed = result.checks.filter((check) => check.status === "fail");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.subject).toBe("/375");
    expect(failed[0]?.detail).toContain("45px");
  });

  it("skips — never passes — without a browser", async () => {
    const result = await run();

    expect(result.checks[0]).toMatchObject({ id: "B2.overflow", status: "skip", level: "error" });
  });

  it("skips a width whose overflow could not be measured", async () => {
    const result = await run(
      browserWith({
        375: { scrollWidth: 375, clientWidth: 375 },
        768: { scrollWidth: 768, clientWidth: 768 },
      }),
    );

    expect(result.checks.find((check) => check.subject === "/1440")).toMatchObject({
      status: "skip",
      level: "error",
    });
  });
});
