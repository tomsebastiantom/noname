import { hasPermission, PERMISSIONS, type PermissionKey } from "@noname/auth";
import type { AgentRegistryStorage } from "./adapters/registry-postgres";
import type { AgentTaskDTO } from "./ports";

export function isStoreAgentAdmin(permissions: Iterable<PermissionKey>): boolean {
  return hasPermission(permissions, PERMISSIONS.AGENT_MANAGE);
}

export async function isRegisteredAgentOwner(
  registry: AgentRegistryStorage,
  orgId: string,
  registeredAgentId: string | null | undefined,
  userId: string,
): Promise<boolean> {
  if (!registeredAgentId) return false;
  const agent = await registry.findById(orgId, registeredAgentId);
  return agent?.ownerUserId === userId;
}

export async function canReviewAgentTask(
  registry: AgentRegistryStorage,
  orgId: string,
  task: AgentTaskDTO,
  userId: string,
  permissions: PermissionKey[],
): Promise<boolean> {
  if (isStoreAgentAdmin(permissions)) return true;
  return isRegisteredAgentOwner(registry, orgId, task.registeredAgentId, userId);
}
