import { type ActionContract, actionContracts } from "@noname/catalog";
import { describe, expect, it } from "vitest";
import { validateActionContracts } from "./contracts";

function contract(audience: readonly string[]): ActionContract {
  return {
    capability: "commerce.example",
    extension: "commerce",
    permission: "commerce:orders_view",
    audience,
  };
}

describe("action contract audiences", () => {
  it("accepts the shipped contracts", () => {
    expect(() => validateActionContracts(actionContracts)).not.toThrow();
  });

  it("rejects a contract without an audience", () => {
    expect(() => validateActionContracts({ broken: contract([]) })).toThrow(/audience is required/);
  });

  it("rejects an unknown role key", () => {
    expect(() => validateActionContracts({ broken: contract(["owner"]) })).toThrow(
      /unknown audience role "owner"/,
    );
  });

  it("rejects duplicate roles", () => {
    expect(() => validateActionContracts({ broken: contract(["admin", "admin"]) })).toThrow(
      /duplicate audience role "admin"/,
    );
  });
});
