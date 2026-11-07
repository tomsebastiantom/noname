import { describe, expect, it } from "vitest";
import { evaluateChecks } from "../index";
import type { CheckContext, EvalClient } from "../types";
import { referenceChecks } from "./references";

type Field = { key: string; type: string; references?: string };

function context(client: EvalClient): CheckContext {
  return {
    client,
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions: false,
  };
}

function clientReturning(types: Array<{ name: string; fields: Field[] }>): EvalClient {
  return {
    async getJson<T>() {
      return {
        ok: true as const,
        data: {
          data: types.map((type) => ({ name: type.name, schema: { fields: type.fields } })),
        } as T,
      };
    },
  };
}

async function run(client: EvalClient) {
  return evaluateChecks(referenceChecks, context(client));
}

describe("M1.references", () => {
  it("passes when every reference target exists", async () => {
    const result = await run(
      clientReturning([
        {
          name: "product",
          fields: [{ key: "category", type: "reference", references: "category" }],
        },
        { name: "category", fields: [] },
      ]),
    );

    expect(result.passed).toBe(true);
    expect(result.checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("fails when a reference target does not exist", async () => {
    const result = await run(
      clientReturning([
        {
          name: "product",
          fields: [{ key: "category", type: "reference", references: "category" }],
        },
      ]),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]).toMatchObject({
      id: "M1.references",
      status: "fail",
      subject: "product",
    });
    expect(result.checks[0]?.detail).toContain("category");
  });

  it("fails when a reference field declares no target", async () => {
    const result = await run(
      clientReturning([{ name: "product", fields: [{ key: "category", type: "reference" }] }]),
    );

    expect(result.passed).toBe(false);
    expect(result.checks[0]?.detail).toContain("declares no target");
  });

  it("passes with an explicit message when no content types exist", async () => {
    const result = await run(clientReturning([]));

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "M1.references", status: "pass" });
    expect(result.checks[0]?.detail).toContain("no content types");
  });

  it("skips — never passes — when the registry cannot be read", async () => {
    const result = await run({
      async getJson() {
        return { ok: false as const, status: 500, error: "HTTP 500" };
      },
    });

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "M1.references", status: "skip", level: "error" });
  });
});
