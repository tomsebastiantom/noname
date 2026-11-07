import { describe, expect, it } from "vitest";
import type { EvidenceRecordInput, EvidenceService } from "../evidence/ports";
import { type EvalGateResult, recordGateDecision } from "./gate";

function evidenceSpy(): { service: EvidenceService; recorded: EvidenceRecordInput[] } {
  const recorded: EvidenceRecordInput[] = [];
  const service = {
    async appendRecord(input: EvidenceRecordInput) {
      recorded.push(input);
      return { ...input, id: "ev-1", recordedAt: new Date() };
    },
  } as unknown as EvidenceService;
  return { service, recorded };
}

const passed: EvalGateResult = {
  runId: "run-1",
  checksVersion: "abc123",
  passed: true,
  counts: { pass: 2, fail: 0, skip: 0, unverified: 0 },
  checks: [
    { id: "M4.machines", status: "pass", level: "error" },
    { id: "B2.overflow", status: "pass", level: "error" },
  ],
};

const blocked: EvalGateResult = {
  runId: "run-2",
  checksVersion: "abc123",
  passed: false,
  counts: { pass: 1, fail: 1, skip: 0, unverified: 0 },
  checks: [
    { id: "M4.machines", status: "pass", level: "error" },
    { id: "B1.structure", status: "fail", level: "error" },
    { id: "B2.console", status: "fail", level: "warn" },
  ],
};

describe("recordGateDecision", () => {
  it("writes one pass decision with the run identity", async () => {
    const { service, recorded } = evidenceSpy();
    const decision = await recordGateDecision(service, {
      orgId: "org-1",
      tenantSlug: "yogastore",
      result: passed,
    });

    expect(decision).toEqual({ decision: "pass", evidenceId: "ev-1" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      orgId: "org-1",
      type: "platform.eval.run",
      subjectType: "tenant.storefront",
      subjectId: "yogastore",
      source: "eval.gate",
      correlationId: "run-1",
      idempotencyKey: "eval:run-1:abc123",
    });
    expect(recorded[0]?.data).toMatchObject({ decision: "pass", failingCheckIds: [] });
  });

  it("records only error-level failures", async () => {
    const { service, recorded } = evidenceSpy();
    const decision = await recordGateDecision(service, {
      orgId: "org-1",
      tenantSlug: "yogastore",
      result: blocked,
    });

    expect(decision.decision).toBe("blocked");
    expect(recorded[0]?.data).toMatchObject({
      decision: "blocked",
      failingCheckIds: ["B1.structure"],
    });
  });
});
