import { useCallback, useEffect, useState } from "react";

/**
 * Platform operator console — tenant inventory.
 *
 * Loaded as an admin **panel** (the spec's `renderAs: "panel"`), so it obeys the same rule as every other org-facing
 * surface: the page itself is a layout document, and this file is only the data-bound component it renders.
 *
 * The endpoint is guarded server-side by `requirePlatformOperator` + `RELEASES_PLATFORM_READ`; this screen adds no
 * authority of its own, it just shows what that guard already allows.
 */
type TenantRow = {
  orgId: string;
  slug: string;
  status: string;
  provisioningState?: string;
  plan: string | null;
  region: string | null;
};

type ProvisioningRow = {
  orgId: string;
  state: string;
  steps?: Record<string, { status: string; error?: string }>;
};

export type PlatformTenantsAdminProps = {
  title: string;
  description: string | null;
  loadingLabel: string;
  emptyLabel: string;
  refreshLabel: string;
  forbiddenLabel: string;
  slugColumnHeader: string;
  statusColumnHeader: string;
  provisioningColumnHeader: string;
  planColumnHeader: string;
};

function authHeaders(): Record<string, string> {
  const token =
    typeof sessionStorage === "undefined" ? null : sessionStorage.getItem("noname:access_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function loadTenants(): Promise<TenantRow[]> {
  const response = await fetch("/api/platform/tenants", { headers: authHeaders() });
  if (response.status === 401 || response.status === 403) throw new Error("forbidden");
  if (!response.ok) throw new Error(`tenants request failed (${response.status})`);
  const body = (await response.json()) as { data?: { tenants?: TenantRow[] } };
  return body.data?.tenants ?? [];
}

export function PlatformTenantsAdmin(props: Readonly<PlatformTenantsAdminProps>) {
  const [rows, setRows] = useState<TenantRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const tenants = await loadTenants();
      const withSteps = await Promise.all(
        tenants.map(async (tenant) => {
          // A tenant with no provisioning record predates the feature; that is a real state, not an error.
          try {
            const response = await fetch(`/api/platform/tenants/${tenant.orgId}/provisioning`, {
              headers: authHeaders(),
            });
            if (!response.ok) return { ...tenant, provisioningState: "unknown" };
            const body = (await response.json()) as { data?: ProvisioningRow };
            return { ...tenant, provisioningState: body.data?.state ?? "unknown" };
          } catch {
            return { ...tenant, provisioningState: "unknown" };
          }
        }),
      );
      setRows(withSteps);
    } catch (cause) {
      setError(cause instanceof Error && cause.message === "forbidden" ? "forbidden" : "failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (error === "forbidden") {
    return <p className="text-sm text-muted-foreground">{props.forbiddenLabel}</p>;
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-lg font-semibold">{props.title}</h1>
        {props.description ? (
          <p className="text-sm text-muted-foreground">{props.description}</p>
        ) : null}
      </header>

      <div>
        <button type="button" className="text-sm underline" onClick={() => void refresh()}>
          {busy ? props.loadingLabel : props.refreshLabel}
        </button>
      </div>

      {error && error !== "forbidden" ? (
        <p className="text-sm text-destructive">Failed to load tenants.</p>
      ) : null}

      {rows === null ? <p className="text-sm text-muted-foreground">{props.loadingLabel}</p> : null}

      {rows && rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{props.emptyLabel}</p>
      ) : null}

      {rows && rows.length > 0 ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              <th className="py-1">{props.slugColumnHeader}</th>
              <th className="py-1">{props.statusColumnHeader}</th>
              <th className="py-1">{props.provisioningColumnHeader}</th>
              <th className="py-1">{props.planColumnHeader}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.orgId} className="border-t border-border">
                <td className="py-1">{row.slug}</td>
                <td className="py-1">{row.status}</td>
                <td className="py-1">{row.provisioningState ?? "unknown"}</td>
                <td className="py-1">{row.plan ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}
