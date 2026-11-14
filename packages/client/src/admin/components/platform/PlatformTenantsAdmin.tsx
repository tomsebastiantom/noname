import { type FormEvent, useCallback, useEffect, useState } from "react";

/**
 * Platform operator console — tenant inventory and provisioning.
 *
 * Loaded as an admin **panel** (the spec's `renderAs: "panel"`), so it obeys the same rule as every other org-facing
 * surface: the page is a layout document, this file is only the data-bound component it renders.
 *
 * Every request goes through the platform API, which owns the authority (`requirePlatformOperator` +
 * `RELEASES_PLATFORM_READ/WRITE`). This screen adds none of its own — if the guard says no, the screen says so.
 */
type TenantRow = {
  orgId: string;
  slug: string;
  status: string;
  plan: string | null;
};

type StepState = { status: string; error?: string };

type Verdict = { status: string; reason?: string };

type RowState = {
  provisioning: string;
  verdict: Verdict | null;
};

function authHeaders(json = false): Record<string, string> {
  const token =
    typeof sessionStorage === "undefined" ? null : sessionStorage.getItem("noname:access_token");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { ...authHeaders(true), ...init?.headers } });
  if (response.status === 401 || response.status === 403) throw new Error("forbidden");
  const body = (await response.json().catch(() => null)) as
    | { data?: T; error?: string }
    | null;
  if (!response.ok) throw new Error(body?.error ?? `request failed (${response.status})`);
  return (body?.data ?? null) as T;
}

export function PlatformTenantsAdmin() {
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [stateByOrg, setStateByOrg] = useState<Record<string, RowState>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [slug, setSlug] = useState("");
  const [email, setEmail] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ tenants?: TenantRow[] }>("/api/platform/tenants");
      const tenants = data?.tenants ?? [];
      setRows(tenants);

      const states: Record<string, RowState> = {};
      await Promise.all(
        tenants.map(async (tenant) => {
          const [provisioning, verdict] = await Promise.all([
            api<{ state: string; steps?: Record<string, StepState> }>(
              `/api/platform/tenants/${tenant.orgId}/provisioning`,
            ).catch(() => null),
            api<Verdict>(`/api/platform/tenants/${tenant.orgId}/verdict`).catch(() => null),
          ]);
          states[tenant.orgId] = {
            // A tenant with no provisioning record predates the feature: that is a state, not a failure.
            provisioning: provisioning?.state ?? "unknown",
            verdict,
          };
        }),
      );
      setStateByOrg(states);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "forbidden" ? "forbidden" : "failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) return;
    setNotice(null);
    setError(null);
    try {
      // The API answers 202: the org is created and the steps run after the response. Not a "done" button.
      await api("/api/platform/tenants", {
        method: "POST",
        body: JSON.stringify({ slug: trimmed, idempotencyKey: `console:${trimmed}:${Date.now()}` }),
      });
      setSlug("");
      setNotice(`Provisioning ${trimmed} — steps will complete shortly.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed");
    }
  }

  async function onBackfill() {
    setNotice(null);
    try {
      const result = await api<{ examined: number; created: number }>(
        "/api/platform/tenants/backfill",
        { method: "POST" },
      );
      setNotice(`Backfill: examined ${result?.examined ?? 0}, created ${result?.created ?? 0}.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed");
    }
  }

  async function onInvite(orgId: string) {
    const address = (email[orgId] ?? "").trim();
    if (!address) return;
    setNotice(null);
    try {
      await api(`/api/platform/tenants/${orgId}/invite`, {
        method: "POST",
        body: JSON.stringify({ email: address }),
      });
      setNotice(`Invited ${address}.`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed");
    }
  }

  async function onAck(row: TenantRow) {
    const reason = window.prompt("Why is this unverified verdict acceptable for this tenant?");
    if (!reason) return;
    try {
      await api(`/api/platform/tenants/${row.orgId}/verdict/ack`, {
        method: "POST",
        body: JSON.stringify({ releaseId: "unassigned", reason }),
      });
      setNotice("Acknowledged. The verdict is still unverified — a wave will not promote it.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "failed");
    }
  }

  if (error === "forbidden") {
    return <p className="text-sm text-muted-foreground">Platform operator rights are required.</p>;
  }

  return (
    <section className="space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Tenants</h1>
        <p className="text-sm text-muted-foreground">
          Every tenant the control plane knows about, with its provisioning and verdict state.
        </p>
      </header>

      <form className="flex items-end gap-2" onSubmit={onCreate}>
        <label className="text-sm">
          <span className="block text-muted-foreground">New tenant slug</span>
          <input
            className="rounded border border-border px-2 py-1"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            placeholder="acme"
          />
        </label>
        <button type="submit" className="rounded border border-border px-3 py-1 text-sm">
          Create
        </button>
        <button type="button" className="text-sm underline" onClick={() => void onBackfill()}>
          Backfill existing
        </button>
        <button type="button" className="text-sm underline" onClick={() => void refresh()}>
          {busy ? "Refreshing…" : "Refresh"}
        </button>
      </form>

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {error && error !== "forbidden" ? <p className="text-sm text-destructive">{error}</p> : null}
      {rows === null ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
      {rows?.length === 0 ? <p className="text-sm text-muted-foreground">No tenants yet.</p> : null}

      {rows && rows.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1">Slug</th>
              <th className="py-1">Status</th>
              <th className="py-1">Provisioning</th>
              <th className="py-1">Verdict</th>
              <th className="py-1">Invite admin</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const state = stateByOrg[row.orgId];
              const verdict = state?.verdict;
              return (
                <tr key={row.orgId} className="border-t border-border align-top">
                  <td className="py-1">{row.slug}</td>
                  <td className="py-1">{row.status}</td>
                  <td className="py-1">{state?.provisioning ?? "…"}</td>
                  <td className="py-1">
                    {verdict ? verdict.status : "…"}
                    {verdict?.status === "unverified" ? (
                      <button
                        type="button"
                        className="ml-2 text-xs underline"
                        onClick={() => void onAck(row)}
                      >
                        Acknowledge
                      </button>
                    ) : null}
                  </td>
                  <td className="py-1">
                    <span className="flex gap-1">
                      <input
                        className="w-48 rounded border border-border px-1 py-0.5 text-xs"
                        placeholder="owner@example.com"
                        value={email[row.orgId] ?? ""}
                        onChange={(event) =>
                          setEmail((prev) => ({ ...prev, [row.orgId]: event.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="text-xs underline"
                        onClick={() => void onInvite(row.orgId)}
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
    </section>
  );
}
