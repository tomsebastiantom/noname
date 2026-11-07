import { describe, expect, it } from "vitest";
import type { BrowserObserver, CartFlow, CheckContext, EvalClient } from "../types";
import { browserChecks } from "./browser";

const behaviourCheck = browserChecks.filter((check) => check.meta.id === "B5.behaviour");

const client: EvalClient = {
  async getJson() {
    return { ok: false as const, status: 404, error: "unused" };
  },
};

function browserWith(flow: () => Promise<CartFlow>): BrowserObserver {
  return {
    async visit() {
      throw new Error("visit unused");
    },
    addFirstProductToCart: flow,
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
  return evaluateChecks(behaviourCheck, context(browser));
}

describe("B5.behaviour", () => {
  it("passes when add-to-cart updates the cart count", async () => {
    const result = await run(
      browserWith(async () => ({
        clicked: true,
        before: "Your cart is empty CAD 0.00",
        after: "Added to cart Your cart 1 item CAD 99.99 Open cart 1",
      })),
    );

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "B5.behaviour", status: "pass" });
    expect(result.checks[0]?.detail).toContain("1 item");
  });

  it("fails when there is no add-to-cart control", async () => {
    const result = await run(
      browserWith(async () => ({ clicked: false, before: "x", after: "x" })),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.detail).toContain("no add-to-cart control");
  });

  it("fails when the click changes nothing", async () => {
    const result = await run(
      browserWith(async () => ({ clicked: true, before: "same", after: "same" })),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.detail).toContain("did not change");
  });

  it("fails when the cart text changes but no count appears", async () => {
    const result = await run(
      browserWith(async () => ({ clicked: true, before: "empty", after: "Added to cart" })),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.detail).toContain("no cart item count");
  });

  it("skips when the observer cannot drive the cart", async () => {
    const result = await run({
      async visit() {
        throw new Error("unused");
      },
      async close() {},
    });

    expect(result.checks[0]).toMatchObject({ id: "B5.behaviour", status: "skip" });
  });

  it("skips without a browser", async () => {
    const result = await run();

    expect(result.checks[0]).toMatchObject({ id: "B5.behaviour", status: "skip" });
  });
});
