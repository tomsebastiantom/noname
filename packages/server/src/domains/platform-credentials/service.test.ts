import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EvidenceAuditInput, EvidenceService } from "../evidence/ports";
import { CREDENTIAL_ACTIONS } from "./actions";
import { readRecordedGrants, reconcileGrants, recordCredentialEvent } from "./service";

const ORG = "platform-org";

function evidence(rows: EvidenceAuditInput[] = []) {
  const audit = vi.fn(async (input: EvidenceAuditInput) => {
    rows.push(input);
    return { ...input, id: `ev-${rows.length}`, recordedAt: new Date() };
  });
  return {
    service: {
      audit,
      listAuditAcross: vi.fn(async () => rows),
    } as unknown as EvidenceService,
    audit,
  };
}

beforeEach(() => {
  process.env.PLATFORM_ORG_ID = ORG;
});
afterEach(() => {
  delete process.env.PLATFORM_ORG_ID;
});

describe("recordCredentialEvent", () => {
  it("writes a platform-scoped row with the actor who made the change", async () => {
    const { service, audit } = evidence();
    await recordCredentialEvent(service, {
      action: CREDENTIAL_ACTIONS.GRANTED,
      accountId: "sa-1",
      accountName: "release-operator",
      role: "platform_operator",
      projectId: "proj-1",
      actorType: "service",
      actorId: "operator-1",
    });

    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG,
        action: "platform.credential.granted",
        actorType: "service",
        actorId: "operator-1",
        subjectType: "platform.service_account",
        subjectId: "sa-1",
        metadata: expect.objectContaining({ role: "platform_operator", projectId: "proj-1" }),
      }),
    );
  });

  it("never stores key material, only the key id", async () => {
    const { service, audit } = evidence();
    await recordCredentialEvent(service, {
      action: CREDENTIAL_ACTIONS.KEY_ADDED,
      accountId: "sa-1",
      keyId: "key-9",
      actorType: "service",
      actorId: "operator-1",
    });

    const row = audit.mock.calls[0]?.[0] as EvidenceAuditInput;
    expect(row.metadata).toEqual({ keyId: "key-9" });
    expect(JSON.stringify(row)).not.toMatch(/BEGIN RSA PRIVATE KEY/);
  });

  it("fails closed when the platform org is not configured", async () => {
    delete process.env.PLATFORM_ORG_ID;
    const { service } = evidence();
    await expect(
      recordCredentialEvent(service, {
        action: CREDENTIAL_ACTIONS.CREATED,
        accountId: "sa-1",
        actorType: "system",
        actorId: "system",
      }),
    ).rejects.toThrow(/PLATFORM_ORG_ID/);
  });
});

describe("readRecordedGrants", () => {
  it("treats a later revoke as removing an earlier grant", async () => {
    const rows: EvidenceAuditInput[] = [
      { orgId: ORG, action: CREDENTIAL_ACTIONS.GRANTED, actorType: "service", actorId: "o", subjectType: "platform.service_account", subjectId: "sa-1", metadata: { role: "platform_operator" } },
      { orgId: ORG, action: CREDENTIAL_ACTIONS.GRANTED, actorType: "service", actorId: "o", subjectType: "platform.service_account", subjectId: "sa-2", metadata: { role: "eval_operator" } },
      { orgId: ORG, action: CREDENTIAL_ACTIONS.REVOKED, actorType: "service", actorId: "o", subjectType: "platform.service_account", subjectId: "sa-2", metadata: { role: "eval_operator" } },
    ];
    const { service } = evidence(rows);
    // listAuditAcross returns newest-first in the adapter; the service reverses it.
    (service.listAuditAcross as unknown as ReturnType<typeof vi.fn>).mockResolvedValue([...rows].reverse());

    await expect(readRecordedGrants(service, ORG)).resolves.toEqual([
      { accountId: "sa-1", role: "platform_operator" },
    ]);
  });
});

describe("reconcileGrants", () => {
  it("is clean when both sides agree", () => {
    const report = reconcileGrants({
      liveGrants: [{ accountId: "sa-1", role: "platform_operator" }],
      recordedGrants: [{ accountId: "sa-1", role: "platform_operator" }],
    });
    expect(report).toMatchObject({ live: 1, recorded: 1, clean: true });
  });

  it("reports a console grant as unrecorded", () => {
    const report = reconcileGrants({
      liveGrants: [
        { accountId: "sa-1", role: "platform_operator" },
        { accountId: "sa-handmade", role: "platform_operator" },
      ],
      recordedGrants: [{ accountId: "sa-1", role: "platform_operator" }],
    });
    expect(report.clean).toBe(false);
    expect(report.unrecorded).toEqual([{ accountId: "sa-handmade", role: "platform_operator" }]);
    expect(report.stale).toEqual([]);
  });

  it("reports a revocation nobody recorded", () => {
    const report = reconcileGrants({
      liveGrants: [],
      recordedGrants: [{ accountId: "sa-1", role: "platform_operator" }],
    });
    expect(report.stale).toEqual([{ accountId: "sa-1", role: "platform_operator" }]);
  });
});
