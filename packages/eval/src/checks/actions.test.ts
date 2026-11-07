import { describe, expect, it } from "vitest";
import { evaluateChecks } from "../index";
import type { CheckContext, EvalClient } from "../types";
import { actionChecks } from "./actions";

function context(client: EvalClient): CheckContext {
  return {
    client,
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions: false,
  };
}

function clientWith(layouts: Array<{ key: string; action?: string }> | null): EvalClient {
  return {
    async getJson<T>(path: string) {
      if (path !== "/api/documents/layout") {
        return { ok: false as const, status: 404, error: `unhandled ${path}` };
      }
      if (layouts === null) return { ok: false as const, status: 500, error: "HTTP 500" };
      return {
        ok: true as const,
        data: {
          data: layouts.map((layout) => ({
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
    },
  };
}

async function run(client: EvalClient) {
  return evaluateChecks(actionChecks, context(client));
}

describe("M2.actions", () => {
  it("passes when a referenced action is declared", async () => {
    const result = await run(clientWith([{ key: "admin_traces", action: "loadTracesAdmin" }]));

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "M2.actions", status: "pass" });
  });

  it("fails on an unknown action", async () => {
    const result = await run(clientWith([{ key: "home", action: "doesSomethingMissing" }]));

    expect(result.passed).toBe(false);
    expect(result.checks[0]).toMatchObject({ id: "M2.actions", status: "fail", subject: "home" });
    expect(result.checks[0]?.detail).toContain("doesSomethingMissing");
  });

  it("passes explicitly when no layout references an action", async () => {
    const result = await run(clientWith([{ key: "home" }]));

    expect(result.passed).toBe(true);
    expect(result.checks[0]?.detail).toContain("no published layout references an action");
  });

  it("skips — never passes — when layouts cannot be listed", async () => {
    const result = await run(clientWith(null));

    expect(result.checks[0]).toMatchObject({ id: "M2.actions", status: "skip", level: "error" });
  });
});
