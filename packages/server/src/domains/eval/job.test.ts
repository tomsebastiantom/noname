import type { EvalResult } from "@noname/eval";
import { describe, expect, it } from "vitest";
import type { EvidenceRecordInput, EvidenceService } from "../evidence/ports";
import { executeEvalJob } from "./job";

function evidenceSpy(): { service: EvidenceService; recorded: EvidenceRecordInput[] } {
  const recorded: EvidenceRecordInput[] = [];
  const service = {
    async appendRecord(input: EvidenceRecordInput) {
      recorded.push(input);
      return { ...input, id: "ev-job", recordedAt: new Date() };
    },
  } as unknown as EvidenceService;
  return { service, recorded };
}

const passed: EvalResult = {
  runId: "job-run-1",
  checksVersion: "v1",
  passed: true,
  counts: { pass: 1, fail: 0, skip: 0, unverified: 0 },
  checks: [{ id: "M4.machines", status: "pass", level: "error", detail: "ok" }],
};

const blocked: EvalResult = {
  ...passed,
  runId: "job-run-2",
  passed: false,
  counts: { pass: 0, fail: 1, skip: 0, unverified: 0 },
  checks: [{ id: "R1.resolve", status: "fail", level: "error", detail: "missing" }],
};

describe("executeEvalJob", () => {
  it("runs the injected evaluation and records one decision", async () => {
    const { service, recorded } = evidenceSpy();
    const decision = await executeEvalJob(
      { orgId: "org-1", tenantSlug: "yogastore" },
      { evidence: service, run: async () => passed },
    );

    expect(decision).toEqual({ decision: "pass", evidenceId: "ev-job" });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      type: "platform.eval.run",
      subjectId: "yogastore",
      correlationId: "job-run-1",
      idempotencyKey: "eval:job-run-1:v1",
    });
  });

  it("records a blocked decision with failing ids", async () => {
    const { service, recorded } = evidenceSpy();
    const decision = await executeEvalJob(
      { orgId: "org-1", tenantSlug: "yogastore" },
      { evidence: service, run: async () => blocked },
    );

    expect(decision.decision).toBe("blocked");
    expect(recorded[0]?.data).toMatchObject({ failingCheckIds: ["R1.resolve"] });
  });
});
