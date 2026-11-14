import { createServiceAccountToken } from "@noname/eval";

/**
 * IdP provisioning for phases 2–3 of the tenant RFC.
 *
 * Every call here needs **instance-level** authority: creating a ZITADEL org, granting a project into another org,
 * and creating a machine user inside that org. The API's own service account is admin in its own org only, so this
 * adapter authenticates with `ZITADEL_ADMIN_PAT` and **fails closed** when it is absent — a tenant must never be
 * recorded as `ready` because the IdP half was silently skipped.
 */
export type ProvisionedOrg = { orgId: string };

export type ProvisionerPort = {
  /** Creates the tenant's ZITADEL org (idempotent by name). */
  ensureOrg(name: string): Promise<ProvisionedOrg>;
  /** Grants the shared project (with tenant roles) to that org. */
  ensureProjectGrant(orgId: string, roleKeys: string[]): Promise<void>;
  /** Creates `eval-runner-<org>` inside the tenant org, with a key and the eval role. */
  ensureEvalAccount(input: {
    orgId: string;
    roleKey: string;
    accountName: string;
  }): Promise<{ userId: string }>;
};

type AdminConfig = { issuer: string; pat: string; projectId: string };

function config(): AdminConfig {
  const issuer = process.env.ZITADEL_ISSUER?.trim() || "http://localhost:8080";
  const pat = process.env.ZITADEL_ADMIN_PAT?.trim() || "";
  const projectId = process.env.ZITADEL_PROJECT_ID?.trim() || "";
  if (!pat) {
    throw new Error(
      "ZITADEL_ADMIN_PAT is required for tenant provisioning (instance-level admin); refusing to record a ready tenant without it",
    );
  }
  if (!projectId) throw new Error("ZITADEL_PROJECT_ID is required for tenant provisioning");
  return { issuer, pat, projectId };
}

async function call<T>(
  admin: AdminConfig,
  method: "GET" | "POST",
  path: string,
  orgId: string | null,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${admin.issuer}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${admin.pat}`,
      "Content-Type": "application/json",
      ...(orgId ? { "x-zitadel-orgid": orgId } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

export function createZitadelProvisioner(): ProvisionerPort {
  return {
    async ensureOrg(name) {
      const admin = config();
      const existing = await call<{ result?: Array<{ id: string; name: string }> }>(
        admin,
        "POST",
        "/v2/organizations/_search",
        null,
        { queries: [], limit: 100 },
      );
      const found = existing.result?.find((org) => org.name === name);
      if (found) return { orgId: found.id };
      const created = await call<{ organizationId: string }>(admin, "POST", "/v2/organizations", null, {
        name,
      });
      return { orgId: created.organizationId };
    },

    async ensureProjectGrant(orgId, roleKeys) {
      const admin = config();
      try {
        await call(admin, "POST", `/management/v1/projects/${admin.projectId}/grants`, null, {
          projectId: admin.projectId,
          grantedOrgId: orgId,
          roleKeys,
        });
      } catch (cause) {
        // A grant is a fact, not a counter: re-running provisioning must reuse it rather than fail the tenant.
        if (!/already exists|409|Conflict/i.test(String(cause))) throw cause;
      }
    },

    async ensureEvalAccount({ orgId, roleKey, accountName }) {
      const admin = config();
      const search = await call<{ result?: Array<{ id: string; userName: string; machine?: unknown }> }>(
        admin,
        "POST",
        "/management/v1/users/_search",
        orgId,
        { queries: [{ userNameQuery: { userName: accountName, method: "TEXT_QUERY_METHOD_EQUALS" } }], limit: 1 },
      );
      let userId = search.result?.find((user) => user.userName === accountName && user.machine)?.id;

      if (!userId) {
        const created = await call<{ userId: string }>(admin, "POST", "/management/v1/users/machine", orgId, {
          userName: accountName,
          name: accountName,
          description: "Tenant eval runner (service account)",
          accessTokenType: "ACCESS_TOKEN_TYPE_JWT",
        });
        userId = created.userId;
      }

      await call(admin, "POST", `/management/v1/users/${userId}/grants`, orgId, {
        projectId: admin.projectId,
        roleKeys: [roleKey],
      }).catch((cause) => {
        if (!/already exists|409|Conflict/i.test(String(cause))) throw cause;
      });

      return { userId };
    },
  };
}

export { createServiceAccountToken };
