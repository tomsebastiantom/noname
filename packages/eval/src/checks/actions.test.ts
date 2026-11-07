import { describe, expect, it } from "vitest";
import { evaluateChecks } from "../index";
import type { CheckContext, EvalClient } from "../types";
import { actionChecks } from "./actions";

type Capability = { name: string; permission?: string; extension?: string };

const defaultCapabilities: Capability[] = [
  { name: "commerce.checkout", permission: "storefront:view", extension: "commerce" },
  { name: "commerce.orders.search", permission: "commerce:orders_view", extension: "commerce" },
  { name: "commerce.orders.get", permission: "commerce:orders_view", extension: "commerce" },
  { name: "commerce.orders.cancel", permission: "commerce:orders_manage", extension: "commerce" },
  { name: "commerce.orders.fulfill", permission: "commerce:orders_manage", extension: "commerce" },
  { name: "commerce.orders.refund", permission: "commerce:orders_manage", extension: "commerce" },
];

function context(client: EvalClient): CheckContext {
  return {
    client,
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions: false,
  };
}

function clientWith(options: {
  layouts: Array<{ key: string; action?: string }> | null;
  capabilities?: Capability[];
  extensions?: string[];
  contextAvailable?: boolean;
}): EvalClient {
  const capabilities = options.capabilities ?? defaultCapabilities;
  const extensions = options.extensions ?? ["commerce"];
  const contextAvailable = options.contextAvailable ?? true;

  return {
    async getJson<T>(path: string) {
      if (path === "/api/documents/layout") {
        if (options.layouts === null) return { ok: false as const, status: 500, error: "HTTP 500" };
        return {
          ok: true as const,
          data: {
            data: options.layouts.map((layout) => ({
              key: layout.key,
              status: "published",
              data: {
                spec: {
                  elements: layout.action
                    ? { button: { type: "MountAction", props: { action: layout.action } } }
                    : { text: { type: "TextBase", props: { content: "Hi" } } },
                },
              },
            })),
          } as T,
        };
      }
      if (path === "/api/eval/context") {
        if (!contextAvailable) return { ok: false as const, status: 401, error: "HTTP 401" };
        return { ok: true as const, data: { data: { capabilities, extensions } } as T };
      }
      return { ok: false as const, status: 404, error: `unhandled ${path}` };
    },
  };
}

async function run(client: EvalClient) {
  return evaluateChecks(actionChecks, context(client));
}

describe("M2.actions", () => {
  it("passes when a referenced action is declared", async () => {
    const result = await run(
      clientWith({ layouts: [{ key: "admin_traces", action: "loadTracesAdmin" }] }),
    );

    expect(result.passed).toBe(true);
    expect(result.checks.find((check) => check.id === "M2.actions")).toMatchObject({
      status: "pass",
    });
  });

  it("fails on an unknown action", async () => {
    const result = await run(
      clientWith({ layouts: [{ key: "home", action: "doesSomethingMissing" }] }),
    );

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "M2.actions")).toMatchObject({
      status: "fail",
      subject: "home",
    });
  });

  it("passes explicitly when no layout references an action", async () => {
    const result = await run(clientWith({ layouts: [{ key: "home" }] }));

    expect(result.passed).toBe(true);
    expect(result.checks.find((check) => check.id === "M2.actions")?.detail).toContain(
      "no published layout references an action",
    );
  });

  it("skips — never passes — when layouts cannot be listed", async () => {
    const result = await run(clientWith({ layouts: null }));

    expect(result.checks[0]).toMatchObject({ id: "M2.actions", status: "skip", level: "error" });
  });
});

describe("M2.permissions", () => {
  it("passes when a capability-backed action is wired to a registered capability", async () => {
    const result = await run(
      clientWith({ layouts: [{ key: "admin_orders", action: "cancelOrder" }] }),
    );

    expect(
      result.checks.some(
        (check) =>
          check.id === "M2.permissions" && check.subject === "contracts" && check.status === "pass",
      ),
    ).toBe(true);
    expect(
      result.checks.some(
        (check) =>
          check.id === "M2.permissions" &&
          check.subject === "admin_orders" &&
          check.status === "pass",
      ),
    ).toBe(true);
  });

  it("fails when the capability is not registered", async () => {
    const result = await run(
      clientWith({
        layouts: [{ key: "admin_orders", action: "cancelOrder" }],
        capabilities: defaultCapabilities.filter((cap) => cap.name !== "commerce.orders.cancel"),
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "M2.permissions")?.detail).toContain(
      "not registered",
    );
  });

  it("fails when the extension is not installed", async () => {
    const result = await run(
      clientWith({ layouts: [{ key: "admin_orders", action: "cancelOrder" }], extensions: [] }),
    );

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "M2.permissions")?.detail).toContain(
      "not installed",
    );
  });

  it("fails when the capability permission drifts from the contract", async () => {
    const result = await run(
      clientWith({
        layouts: [{ key: "admin_orders", action: "cancelOrder" }],
        capabilities: defaultCapabilities.map((cap) =>
          cap.name === "commerce.orders.cancel"
            ? { ...cap, permission: "commerce:orders_view" }
            : cap,
        ),
      }),
    );

    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.id === "M2.permissions")?.detail).toContain(
      "contract expects",
    );
  });

  it("skips the wiring check — never passes it — without the machine context", async () => {
    const result = await run(
      clientWith({
        layouts: [{ key: "admin_orders", action: "cancelOrder" }],
        contextAvailable: false,
      }),
    );

    expect(result.checks.find((check) => check.id === "M2.permissions")).toMatchObject({
      status: "skip",
      level: "error",
    });
  });
});
