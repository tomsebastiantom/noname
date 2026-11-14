import { apiFetchData, apiFetchVoid } from "../../lib/api";
import { ADMIN_STATE } from "../admin-state";
import type { CatalogActionHandler } from "./types";

/**
 * Platform console actions.
 *
 * The panel is a catalog component, so it must not call `fetch` itself (spec-driven-ui checklist): every request goes
 * through an action handler that writes to `$state`, and the component renders what it reads. That keeps one place
 * where the console talks to the API, and keeps the copy/behaviour in the layout document.
 */
type TenantRow = { orgId: string; slug: string; status: string; plan: string | null };
type TenantState = { provisioning: string; verdict: string };

const STATE = ADMIN_STATE.platform;

async function loadRows(setState: (path: string, value: unknown) => void): Promise<void> {
  setState(STATE.loading, true);
  setState(STATE.error, null);
  try {
    const data = await apiFetchData<{ tenants?: TenantRow[] }>("/api/platform/tenants");
    const tenants = data.tenants ?? [];
    setState(STATE.tenants, tenants);

    const states: Record<string, TenantState> = {};
    await Promise.all(
      tenants.map(async (tenant) => {
        const [provisioning, verdict] = await Promise.all([
          apiFetchData<{ state: string }>(`/api/platform/tenants/${tenant.orgId}/provisioning`).catch(
            () => null,
          ),
          apiFetchData<{ status: string }>(`/api/platform/tenants/${tenant.orgId}/verdict`).catch(
            () => null,
          ),
        ]);
        states[tenant.orgId] = {
          // No provisioning record means the tenant predates the feature: a state, not a failure.
          provisioning: provisioning?.state ?? "unknown",
          verdict: verdict?.status ?? "unknown",
        };
      }),
    );
    setState(STATE.rows, states);
  } catch (cause) {
    setState(STATE.error, cause instanceof Error ? cause.message : "Failed to load tenants");
    setState(STATE.tenants, []);
  } finally {
    setState(STATE.loading, false);
  }
}

export const platformActions = {
  loadPlatformTenants: (async (_params, setState) => {
    await loadRows(setState);
  }) satisfies CatalogActionHandler,

  createPlatformTenant: (async (params, setState) => {
    const slug = String((params as { slug?: string }).slug ?? "").trim().toLowerCase();
    if (!slug) return;
    setState(STATE.notice, null);
    try {
      await apiFetchVoid("/api/platform/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The API answers 202: steps run after the response, so this is "accepted", never "done".
        body: JSON.stringify({ slug, idempotencyKey: `console:${slug}:${Date.now()}` }),
      });
      setState(STATE.notice, `Provisioning ${slug} — steps will complete shortly.`);
      await loadRows(setState);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Create failed");
    }
  }) satisfies CatalogActionHandler,

  backfillPlatformTenants: (async (_params, setState) => {
    try {
      const result = await apiFetchData<{ examined: number; created: number }>(
        "/api/platform/tenants/backfill",
        { method: "POST" },
      );
      setState(STATE.notice, `Backfill: examined ${result.examined}, created ${result.created}.`);
      await loadRows(setState);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Backfill failed");
    }
  }) satisfies CatalogActionHandler,

  invitePlatformTenant: (async (params, setState) => {
    const { orgId, email } = params as { orgId?: string; email?: string };
    if (!orgId || !email) return;
    try {
      await apiFetchVoid(`/api/platform/tenants/${orgId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(STATE.notice, `Invited ${email}.`);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Invite failed");
    }
  }) satisfies CatalogActionHandler,

  ackPlatformTenant: (async (params, setState) => {
    const { orgId, reason } = params as { orgId?: string; reason?: string };
    if (!orgId || !reason) return;
    try {
      await apiFetchVoid(`/api/platform/tenants/${orgId}/verdict/ack`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId: "unassigned", reason }),
      });
      setState(STATE.notice, "Acknowledged. The verdict stays unverified — a wave will not promote it.");
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Acknowledgement failed");
    }
  }) satisfies CatalogActionHandler,

  promotePlatformTenant: (async (params, setState) => {
    const { orgId, releaseId } = params as { orgId?: string; releaseId?: string };
    if (!orgId || !releaseId) {
      setState(STATE.notice, "Enter a release id first.");
      return;
    }
    try {
      const result = await apiFetchData<{
        results?: Array<{ orgId: string; status: string; reason?: string }>;
      }>(`/api/releases/${encodeURIComponent(releaseId)}/rollout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgIds: [orgId], dryRun: false }),
      });
      const outcome = result.results?.find((item) => item.orgId === orgId);
      setState(
        STATE.promoteResult,
        outcome ? `${outcome.status}${outcome.reason ? ` (${outcome.reason})` : ""}` : "unknown",
      );
      await loadRows(setState);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Promotion failed");
    }
  }) satisfies CatalogActionHandler,

  /** Soft delete: hidden from the console, restorable inside the retention window. */
  deletePlatformTenant: (async (params, setState) => {
    const { orgId } = params as { orgId?: string };
    if (!orgId) return;
    try {
      await apiFetchVoid(`/api/platform/tenants/${orgId}`, { method: "DELETE" });
      setState(STATE.notice, "Tenant marked deleted — hidden from this list, rows retained.");
      await loadRows(setState);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Delete failed");
    }
  }) satisfies CatalogActionHandler,

  /** Purge: irreversible. Only offered once the tenant is soft-deleted, and confirmed by the operator. */
  purgePlatformTenant: (async (params, setState) => {
    const { orgId } = params as { orgId?: string };
    if (!orgId) return;
    if (!window.confirm("Permanently remove this tenant's rows and IdP org? This cannot be undone.")) {
      return;
    }
    try {
      await apiFetchVoid(`/api/platform/tenants/${orgId}/purge`, { method: "POST" });
      setState(STATE.notice, "Tenant purged. The audit row stays in the platform stream.");
      await loadRows(setState);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "Purge failed");
    }
  }) satisfies CatalogActionHandler,

  rollbackPlatformTenant: (async (params, setState) => {
    const { orgId } = params as { orgId?: string };
    if (!orgId) return;
    try {
      await apiFetchVoid(`/api/platform/tenants/${orgId}/rollback`, { method: "POST" });
      setState(STATE.promoteResult, "rolled back");
      await loadRows(setState);
    } catch (cause) {
      // A tenant with no previous release answers 409 with a clear message; surface it rather than inventing one.
      setState(STATE.error, cause instanceof Error ? cause.message : "Rollback failed");
    }
  }) satisfies CatalogActionHandler,

  loadPlatformTenantHistory: (async (params, setState) => {
    const { orgId } = params as { orgId?: string };
    if (!orgId) return;
    try {
      const events = await apiFetchData<Array<{ action: string; recordedAt: string; metadata?: unknown }>>(
        `/api/platform/tenants/${orgId}/history`,
      );
      setState(STATE.historyOrgId, orgId);
      setState(STATE.history, events);
    } catch (cause) {
      setState(STATE.error, cause instanceof Error ? cause.message : "History failed");
    }
  }) satisfies CatalogActionHandler,
};
