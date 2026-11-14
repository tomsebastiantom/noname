import { useActions, useStateValue } from "@json-render/react";
import { useEffect, useRef, useState } from "react";
import { ADMIN_STATE } from "../../../core/admin-state";
import type { ComponentCtx } from "../../../core/components/types";

/**
 * Platform operator console — tenant inventory, provisioning and release actions.
 *
 * This is a **catalog component**: it owns layout and interaction only. Data arrives through `$state` written by
 * action handlers (`core/actions/platform.ts`), and every request is an `execute(...)` call — never a `fetch` here
 * (spec-driven-ui checklist). Copy that belongs to the product lives in the layout document's props.
 */
type TenantRow = { orgId: string; slug: string; status: string; plan: string | null };
type RowState = { provisioning: string; verdict: string };
type HistoryEvent = { action: string; recordedAt: string; metadata?: { to?: string; from?: string } };

export type PlatformTenantsAdminProps = {
  title?: string;
  description?: string | null;
};

export function PlatformTenantsAdmin({ props }: Readonly<ComponentCtx<PlatformTenantsAdminProps>>) {
  const { execute } = useActions();
  const tenants = useStateValue(ADMIN_STATE.platform.tenants) as TenantRow[] | null;
  const rows = (useStateValue(ADMIN_STATE.platform.rows) as Record<string, RowState> | null) ?? {};
  const loading = useStateValue(ADMIN_STATE.platform.loading) as boolean | null;
  const error = useStateValue(ADMIN_STATE.platform.error) as string | null;
  const notice = useStateValue(ADMIN_STATE.platform.notice) as string | null;
  const promoteResult = useStateValue(ADMIN_STATE.platform.promoteResult) as string | null;
  const history = useStateValue(ADMIN_STATE.platform.history) as HistoryEvent[] | null;
  const historyOrgId = useStateValue(ADMIN_STATE.platform.historyOrgId) as string | null;

  const [slug, setSlug] = useState("");
  const [releaseId, setReleaseId] = useState("");
  const [emails, setEmails] = useState<Record<string, string>>({});

  // Mount load: `execute` changes identity on loading-state updates, so keep it on a ref and run once.
  const executeRef = useRef(execute);
  executeRef.current = execute;
  useEffect(() => {
    void executeRef.current({ action: "loadPlatformTenants" });
  }, []);

  const run = (action: string, params?: Record<string, unknown>) =>
    void executeRef.current({ action, ...(params ? { params } : {}) });

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold">{props.title ?? "Tenants"}</h1>
        {props.description ? (
          <p className="text-sm text-muted-foreground">{props.description}</p>
        ) : null}
      </header>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = slug.trim().toLowerCase();
          if (trimmed) run("createPlatformTenant", { slug: trimmed });
        }}
      >
        <label className="text-sm">
          <span className="block text-muted-foreground">New tenant slug</span>
          <input
            className="rounded border border-border px-2 py-1"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="acme"
          />
        </label>
        <label className="text-sm">
          <span className="block text-muted-foreground">Release id</span>
          <input
            className="rounded border border-border px-2 py-1"
            value={releaseId}
            onChange={(event) => setReleaseId(event.target.value)}
            placeholder="release uuid"
          />
        </label>
        <button type="submit" className="rounded border border-border px-3 py-1 text-sm">
          Create
        </button>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => run("backfillPlatformTenants")}
        >
          Backfill existing
        </button>
        <button
          type="button"
          className="text-sm underline"
          onClick={() => run("loadPlatformTenants")}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </form>

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {tenants === null ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {tenants?.length === 0 ? <p className="text-sm text-muted-foreground">No tenants yet.</p> : null}

      {tenants && tenants.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1">Slug</th>
              <th className="py-1">Status</th>
              <th className="py-1">Provisioning</th>
              <th className="py-1">Verdict</th>
              <th className="py-1">Release</th>
              <th className="py-1">Invite admin</th>
            </tr>
          </thead>
          <tbody>
            {tenants.map((tenant) => {
              const state = rows[tenant.orgId];
              return (
                <tr key={tenant.orgId} className="border-t border-border align-top">
                  <td className="py-1">{tenant.slug}</td>
                  <td className="py-1">{tenant.status}</td>
                  <td className="py-1">{state?.provisioning ?? "…"}</td>
                  <td className="py-1">
                    {state?.verdict ?? "…"}
                    {state?.verdict === "unverified" ? (
                      <button
                        type="button"
                        className="ml-2 text-xs underline"
                        onClick={() => {
                          const reason = window.prompt("Why is this unverified verdict acceptable?");
                          if (reason)
                            run("ackPlatformTenant", { orgId: tenant.orgId, reason });
                        }}
                      >
                        Acknowledge
                      </button>
                    ) : null}
                  </td>
                  <td className="py-1">
                    <button
                      type="button"
                      className="text-xs underline"
                      onClick={() =>
                        run("promotePlatformTenant", { orgId: tenant.orgId, releaseId })
                      }
                    >
                      Promote
                    </button>
                    <button
                      type="button"
                      className="ml-2 text-xs underline"
                      onClick={() => run("rollbackPlatformTenant", { orgId: tenant.orgId })}
                    >
                      Rollback
                    </button>
                    <button
                      type="button"
                      className="ml-2 text-xs underline"
                      onClick={() => run("loadPlatformTenantHistory", { orgId: tenant.orgId })}
                    >
                      History
                    </button>
                    {promoteResult ? (
                      <span className="ml-2 text-xs text-muted-foreground">{promoteResult}</span>
                    ) : null}
                  </td>
                  <td className="py-1">
                    <span className="flex gap-1">
                      <input
                        className="w-44 rounded border border-border px-1 py-0.5 text-xs"
                        placeholder="owner@example.com"
                        value={emails[tenant.orgId] ?? ""}
                        onChange={(event) =>
                          setEmails((prev) => ({ ...prev, [tenant.orgId]: event.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => {
                          const email = (emails[tenant.orgId] ?? "").trim();
                          if (email) run("invitePlatformTenant", { orgId: tenant.orgId, email });
                        }}
                      >
                        Invite
                      </button>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}

      {history && history.length > 0 ? (
        <section className="space-y-1">
          <h2 className="text-sm font-semibold">Release history — {historyOrgId}</h2>
          <ul className="text-xs text-muted-foreground">
            {history.map((event, index) => (
              <li key={`${event.recordedAt}-${index}`}>
                {event.recordedAt} · {event.action}
                {event.metadata?.to ? ` → ${event.metadata.to}` : ""}
                {event.metadata?.from ? ` (from ${event.metadata.from})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
