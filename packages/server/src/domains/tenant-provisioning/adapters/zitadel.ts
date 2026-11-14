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
  /** First human admin of the tenant org (invite-first). Idempotent by email. */
  ensureHumanAdmin(input: { orgId: string; email: string }): Promise<{ userId: string }>;
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
      // A grant may only name roles that exist on the project. The tenant project does not carry the eval role by
      // default (live run: Errors.Project.Role.NotFound), so ensure them first — idempotently.
      for (const roleKey of roleKeys) {
        await call(admin, "POST", `/management/v1/projects/${admin.projectId}/roles`, null, {
          roleKey,
          displayName: roleKey.replace(/_/g, " "),
          group: "Tenant",
        }).catch((cause) => {
          if (!/already exists|409|Conflict|Role\\.AlreadyExists/i.test(String(cause))) throw cause;
        });
      }
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

      // Read it back. A grant with no roles is a bridge with no lanes: the tenant org can see the project but none of
      // its users can ever hold a role. The live run produced exactly that, so the step must not report `done`.
      const grants = await call<{ result?: Array<{ grantedOrgId?: string; grantedRoleKeys?: string[] }> }>(
        admin,
        "POST",
        `/management/v1/projects/${admin.projectId}/grants/_search`,
        null,
        {},
      );
      const mine = grants.result?.find((grant) => grant.grantedOrgId === orgId);
      const present = mine?.grantedRoleKeys ?? [];
      const missing = roleKeys.filter((key) => !present.includes(key));
      if (missing.length > 0) {
        throw new Error(
          `project grant for ${orgId} is active but carries no role: ${missing.join(", ")}`,
        );
      }
    },

    /**
     * First human admin, invite-first: the account is created inside the tenant org (no password) and made
     * ORG_OWNER, so the customer owns their own org instead of borrowing a role on our project. Idempotent by email.
     */
    async ensureHumanAdmin({ orgId, email }) {
      const admin = config();
      const search = await call<{ result?: Array<{ id: string }> }>(
        admin,
        "POST",
        "/management/v1/users/_search",
        orgId,
        { queries: [{ emailQuery: { emailAddress: email, method: "TEXT_QUERY_METHOD_EQUALS" } }], limit: 1 },
      );
      let userId = search.result?.[0]?.id;
      if (!userId) {
        const created = await call<{ userId: string }>(admin, "POST", "/management/v1/users/human", orgId, {
          userName: email,
          // `email` is a top-level field of AddHumanUserRequest; nesting it under `profile` is rejected with
          // "value is required" — learned from the live run, not from the docs.
          email: { email },
          profile: { firstName: "Tenant", lastName: "Owner" },
        });
        userId = created.userId;
      }
      // AddOrgMember takes a single `userId` (not `userIds`) — the plural form is rejected with
      // "UserId: value length must be between 1 and 200 runes" because the field never binds.
      await call(admin, "POST", "/management/v1/orgs/me/members", orgId, {
        userId,
        roles: ["ORG_OWNER"],
      }).catch((cause) => {
        if (!/already exists|409|Conflict|AlreadyExists/i.test(String(cause))) throw cause;
      });
      return { userId };
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
