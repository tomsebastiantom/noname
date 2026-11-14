import { afterAll, describe, expect, it } from "vitest";
import {
  deleteTenantOrg,
  operatorToken,
  platformApi,
  uniqueSlug,
  waitForProvisioning,
} from "../support/stack";

/**
 * Offboarding, end to end through public surfaces.
 *
 * The claim under test is not "a status column changed" — it is that a tenant stops being promotable **before** its
 * credential disappears, and that the whole sequence is attributable afterwards.
 */
describe("tenant offboarding", () => {
  const slug = uniqueSlug("e2e-offboard");
  let token = "";
  let orgId = "";

  afterAll(async () => {
    if (orgId) await deleteTenantOrg(orgId);
  });

  it("provisions a tenant that a wave would accept", async () => {
    token = await operatorToken();

    const created = await platformApi<{ data?: { orgId: string } }>(token, "/api/platform/tenants", {
      method: "POST",
      body: JSON.stringify({ slug, idempotencyKey: `e2e:${slug}` }),
    });
    expect([200, 202]).toContain(created.status);
    orgId = created.body.data?.orgId ?? "";
    expect(orgId).not.toBe("");

    const provisioning = await waitForProvisioning(token, orgId);
    expect(provisioning.state).toBe("ready");
    expect(provisioning.steps.identity?.status).toBe("done");
    expect(provisioning.steps.eval_account?.status).toBe("done");
  });

  it("lists the tenant as active and promotable before offboarding", async () => {
    const { body } = await platformApi<{ data?: { tenants?: Array<{ orgId: string; status: string }> } }>(
      token,
      "/api/platform/tenants",
    );
    const row = body.data?.tenants?.find((tenant) => tenant.orgId === orgId);
    expect(row?.status).toBe("active");
  });

  it("offboards: marks the tenant, revokes the credential, records it", async () => {
    const { status, body } = await platformApi<{
      data?: { steps: Record<string, { status: string }> };
    }>(token, `/api/platform/tenants/${orgId}/offboard`, { method: "POST", body: "{}" });
    expect(status).toBe(200);
    expect(body.data?.steps.offboard?.status).toBe("done");

    // The directory is the source of truth for waves; it must say offboarding.
    const { body: directory } = await platformApi<{
      data?: { tenants?: Array<{ orgId: string; status: string }> };
    }>(token, "/api/platform/tenants");
    const row = directory.data?.tenants?.find((tenant) => tenant.orgId === orgId);
    expect(row?.status).toBe("offboarding");

    // …and the revocation must be in the tenant's own audit stream.
    const { body: revoked } = await platformApi<{
      data?: { events?: Array<{ action: string; orgId: string }>; count?: number };
    }>(token, `/api/platform/audit?action=platform.credential.revoked&orgId=${orgId}`);
    expect(revoked.data?.count ?? revoked.data?.events?.length ?? 0).toBeGreaterThan(0);
  });

  it("is refused by a wave, with the reason stated", async () => {
    const releases = await platformApi<{ data?: Array<{ id: string }> }>(token, "/api/releases");
    const releaseId = releases.body.data?.[0]?.id;
    expect(releaseId).toBeTruthy();

    const { status, body } = await platformApi<{
      data?: { results?: Array<{ orgId: string; status: string; reason?: string }> };
    }>(token, `/api/releases/${releaseId}/rollout`, {
      method: "POST",
      body: JSON.stringify({ orgIds: [orgId], dryRun: true }),
    });

    expect(status).toBe(200);
    const result = body.data?.results?.find((item) => item.orgId === orgId);
    expect(result?.status).toBe("skipped");
    expect(result?.reason).toBe("tenant_offboarding");
  });
});
