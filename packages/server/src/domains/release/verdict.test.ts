import { describe, expect, it } from "vitest";
import type { EvidenceRecord } from "../evidence/ports";
import { createGateVerdictService } from "./verdict";

function record(overrides: {
  decision?: "pass" | "blocked";
  checksVersion?: string;
  unverified?: number;
}): EvidenceRecord {
  return {
    id: "ev-1",
    orgId: "org-1",
    type: "platform.eval.run",
    subjectType: "tenant.storefront",
    subjectId: "yogastore",
    correlationId: "run-1",
    recordedAt: new Date("2026-11-12T00:00:00.000Z"),
    data: {
      decision: overrides.decision ?? "pass",
      checksVersion: overrides.checksVersion ?? "v1",
      counts: { pass: 10, fail: 0, skip: 0, unverified: overrides.unverified ?? 0 },
    },
  } as unknown as EvidenceRecord;
}

function service(rows: EvidenceRecord[]) {
  return createGateVerdictService({
    listRecords: async () => rows,
  } as never);
}

describe("gate verdict", () => {
  it("is missing when no decision exists", async () => {
    await expect(service([]).lookup({ orgId: "org-1" })).resolves.toMatchObject({
      status: "missing",
      reason: "no_decision",
    });
  });

  it("is pass for a clean pass on the same catalogue", async () => {
    await expect(
      service([record({ decision: "pass", checksVersion: "v1" })]).lookup({
        orgId: "org-1",
        checksVersion: "v1",
      }),
    ).resolves.toMatchObject({ status: "pass", runId: "run-1" });
  });

  it("is block when the last decision blocked the tenant", async () => {
    await expect(
      service([record({ decision: "blocked" })]).lookup({ orgId: "org-1", checksVersion: "v1" }),
    ).resolves.toMatchObject({ status: "block", reason: "blocked" });
  });

  it("is unverified when the pass used a different checks catalogue", async () => {
    await expect(
      service([record({ decision: "pass", checksVersion: "v0" })]).lookup({
        orgId: "org-1",
        checksVersion: "v1",
      }),
    ).resolves.toMatchObject({ status: "unverified", reason: "checks_version_mismatch" });
  });

  it("is unverified when required checks were skipped", async () => {
    await expect(
      service([record({ decision: "pass", checksVersion: "v1", unverified: 2 })]).lookup({
        orgId: "org-1",
        checksVersion: "v1",
      }),
    ).resolves.toMatchObject({ status: "unverified", reason: "unverified_checks" });
  });

  it("is missing when evidence is not wired", async () => {
    await expect(createGateVerdictService(undefined).lookup({ orgId: "org-1" })).resolves.toMatchObject(
      { status: "missing" },
    );
  });
});
