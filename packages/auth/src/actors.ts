import { hasPermission, PERMISSIONS, type PermissionKey } from "./permissions";

export type ActorType = "human" | "agent" | "machine";

export interface HumanActor {
  type: "human";
  userId: string;
  permissions: PermissionKey[];
}

export interface AgentActor {
  type: "agent";
  agentId: string;
  agentSlug: string;
  onBehalfOf: string;
  orgId: string;
  permissions: PermissionKey[];
}

export type AuthActor = HumanActor | AgentActor;

/** Platform permissions an agent may ever receive (no publish, admin, or scope). */
export const AGENT_ALLOWED_PERMISSIONS: readonly PermissionKey[] = [
  PERMISSIONS.STOREFRONT_VIEW,
  PERMISSIONS.CONTENT_DRAFT_WRITE,
  PERMISSIONS.LAYOUT_DRAFT_WRITE,
  PERMISSIONS.PAGE_DRAFT_WRITE,
];

const AGENT_ALLOWED = new Set<PermissionKey>(AGENT_ALLOWED_PERMISSIONS);

/** effective_agent_permissions ⊆ creator_permissions */
export function intersectAgentPermissions(
  creatorPermissions: Iterable<PermissionKey>,
  requested?: Iterable<PermissionKey>,
): PermissionKey[] {
  const creator = new Set(creatorPermissions);
  const pool = requested ? [...requested] : AGENT_ALLOWED_PERMISSIONS;
  const out: PermissionKey[] = [];
  for (const permission of pool) {
    if (AGENT_ALLOWED.has(permission) && creator.has(permission)) {
      out.push(permission);
    }
  }
  return out;
}

export function actorHasPermission(actor: AuthActor, permission: PermissionKey): boolean {
  return hasPermission(actor.permissions, permission);
}
