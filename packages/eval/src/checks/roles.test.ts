import { expandPermissionsFromKeys } from "@noname/auth";
import { describe, expect, it } from "vitest";
import { evaluateChecks } from "../index";
import type { CheckContext, EvalClient } from "../types";
import { actionChecks } from "./actions";

const roleCheck = actionChecks.filter((check) => check.meta.id === "M2.roles");

function clientWithRoles(roles: Record<string, string[]> | null): EvalClient {
  return {
    async getJson<T>() {
      return { ok: true as const, data: { data: { roles } } as T };
    },
  };
}

function context(roles: Record<string, string[]> | null): CheckContext {
  return {
    client: clientWithRoles(roles),
    tenantSlug: "yogastore",
    machinesDir: "",
    maxRoutes: 20,
    canReadDefinitions: false,
  };
}

describe("M2.roles", () => {
  it("passes when the audience role holds the permission", async () => {
    const result = await evaluateChecks(
      roleCheck,
      context({ admin: expandPermissionsFromKeys(["admin"]) }),
    );

    expect(result.passed).toBe(true);
    expect(result.checks[0]).toMatchObject({ id: "M2.roles", status: "pass", level: "error" });
  });

  it("fails when an audience role is present but does not hold the permission", async () => {
    // editor is in the audience of the orders views but grants nothing here.
    const result = await evaluateChecks(roleCheck, context({ editor: [] }));

    expect(result.passed).toBe(false);
    expect(result.checks[0]).toMatchObject({ id: "M2.roles", status: "fail", level: "error" });
    expect(result.checks[0]?.detail).toContain("commerce:orders_view");
  });

  it("skips — never passes — when role data is unavailable", async () => {
    const result = await evaluateChecks(roleCheck, context(null));

    expect(result.checks[0]).toMatchObject({ id: "M2.roles", status: "skip", level: "error" });
    expect(result.counts.unverified).toBe(1);
  });

  it("skips when the tenant has none of the declared audience roles", async () => {
    // flags_manager is not in any action audience.
    const result = await evaluateChecks(
      roleCheck,
      context({ flags_manager: expandPermissionsFromKeys(["flags_manager"]) }),
    );

    expect(result.checks[0]).toMatchObject({ id: "M2.roles", status: "skip", level: "error" });
  });
});
