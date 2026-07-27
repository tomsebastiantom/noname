const PLATFORM_ROLES = new Set(["admin", "editor", "customer"]);

function projectRolesClaimKeys(payload: Record<string, unknown>, projectId?: string): string[] {
  if (projectId) return [`urn:zitadel:iam:org:project:${projectId}:roles`];
  return Object.keys(payload).filter(
    (key) => key.startsWith("urn:zitadel:iam:org:project:") && key.endsWith(":roles"),
  );
}

/** Parse platform role keys from a ZITADEL JWT payload (edge-safe copy of server helper). */
export function rolesFromZitadelJwt(
  payload: Record<string, unknown>,
  projectId?: string,
): string[] {
  const found = new Set<string>();

  for (const claimKey of projectRolesClaimKeys(payload, projectId)) {
    const claim = payload[claimKey];
    if (!claim || typeof claim !== "object" || Array.isArray(claim)) continue;
    for (const key of Object.keys(claim as Record<string, unknown>)) {
      if (PLATFORM_ROLES.has(key)) found.add(key);
    }
  }

  const projectsRoles = payload["urn:zitadel:iam:org:projects:roles"];
  if (Array.isArray(projectsRoles)) {
    for (const entry of projectsRoles) {
      if (typeof entry === "string" && PLATFORM_ROLES.has(entry)) found.add(entry);
    }
  }

  return [...found];
}

export function primaryRoleFromKeys(roles: string[]): string {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("editor")) return "editor";
  if (roles.includes("customer")) return "customer";
  return "customer";
}

export function canDraftAtEdge(roles: string[]): boolean {
  return roles.includes("admin") || roles.includes("editor");
}
