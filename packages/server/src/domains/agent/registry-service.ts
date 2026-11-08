import {
  hasPermission,
  intersectAgentPermissions,
  PERMISSIONS,
  type PermissionKey,
} from "@noname/auth";
import { NotFoundError, ServiceUnavailableError, ValidationError } from "../../shared/domain-error";
import { exchangeDelegatedToken, serviceAccountToken } from "../../shared/zitadel-token";
import type { AuthorizationPort } from "../auth/authorization-port";
import type { AgentRegistryStorage, RegisteredAgentRow } from "./adapters/registry-postgres";
import { ORCHESTRATE_TOOL_IDS } from "./mastra/guards";
import { ensureAgentActor } from "./zitadel-provisioning";

export function createAgentRegistryService(deps: {
  storage: AgentRegistryStorage;
  authorization: AuthorizationPort;
  resolveCreatorPermissions: (userId: string, userToken: string) => Promise<PermissionKey[]>;
}) {
  async function assertCreatorScope(
    _orgId: string,
    creatorUserId: string,
    creatorPermissions: PermissionKey[],
    namespace: "Collection" | "Document",
    objectId: string,
  ): Promise<void> {
    if (hasPermission(creatorPermissions, PERMISSIONS.AUTH_MANAGE)) return;
    const allowed = await deps.authorization.check({
      subject: { type: "User", id: creatorUserId },
      permission: "edit",
      namespace,
      objectId,
    });
    if (!allowed) {
      throw new ValidationError(
        namespace.toLowerCase(),
        "Creator lacks edit access for delegation",
      );
    }
  }

  async function requireOwnedAgent(
    orgId: string,
    agentId: string,
    actingUserId: string,
    actingPermissions: PermissionKey[],
  ): Promise<RegisteredAgentRow> {
    const agent = await deps.storage.findById(orgId, agentId);
    if (!agent) throw new NotFoundError("Agent", agentId);
    const isOwner = agent.ownerUserId === actingUserId;
    const isAdmin = hasPermission(actingPermissions, PERMISSIONS.AUTH_MANAGE);
    if (!isOwner && !isAdmin) {
      throw new ValidationError(
        "agentId",
        "Only the agent owner or store admin may perform this action",
      );
    }
    return agent;
  }

  return {
    list(orgId: string): Promise<RegisteredAgentRow[]> {
      return deps.storage.list(orgId);
    },

    async register(
      orgId: string,
      input: { slug: string; label?: string; allowedTools?: string[] },
      creator: { userId: string; permissions: PermissionKey[] },
    ): Promise<RegisteredAgentRow> {
      const canRegister =
        hasPermission(creator.permissions, PERMISSIONS.AGENT_MANAGE) ||
        hasPermission(creator.permissions, PERMISSIONS.CONTENT_DRAFT_WRITE) ||
        hasPermission(creator.permissions, PERMISSIONS.LAYOUT_DRAFT_WRITE);
      if (!canRegister) {
        throw new ValidationError("userId", "Insufficient permissions to register an agent");
      }

      const agent = await deps.storage.create({
        orgId,
        slug: input.slug,
        label: input.label ?? input.slug,
        ownerUserId: creator.userId,
        allowedTools:
          input.allowedTools && input.allowedTools.length > 0
            ? input.allowedTools
            : [...ORCHESTRATE_TOOL_IDS],
      });

      await deps.authorization.grant({
        namespace: "Agent",
        objectId: agent.slug,
        relation: "owners",
        subject: { type: "User", id: creator.userId },
      });

      return agent;
    },

    async delete(
      orgId: string,
      agentId: string,
      acting: { userId: string; permissions: PermissionKey[] },
    ): Promise<void> {
      const agent = await requireOwnedAgent(orgId, agentId, acting.userId, acting.permissions);
      const tuples = await deps.authorization.listRelationTuples({
        namespace: "Agent",
        objectId: agent.slug,
      });
      for (const tuple of tuples) {
        await deps.authorization.revoke(tuple);
      }
      const collectionBindings = await deps.authorization.listRelationTuples({
        namespace: "Collection",
        subjectSet: { namespace: "Agent", object: agent.slug, relation: "" },
      });
      for (const tuple of collectionBindings) {
        await deps.authorization.revoke(tuple);
      }
      const documentBindings = await deps.authorization.listRelationTuples({
        namespace: "Document",
        subjectSet: { namespace: "Agent", object: agent.slug, relation: "" },
      });
      for (const tuple of documentBindings) {
        await deps.authorization.revoke(tuple);
      }
      await deps.storage.delete(orgId, agentId);
    },

    async mintToken(
      orgId: string,
      agentId: string,
      acting: { userId: string; userToken: string; permissions: PermissionKey[] },
      requestedPermissions?: PermissionKey[],
    ): Promise<{ token: string; expiresAt: number; permissions: PermissionKey[] }> {
      const agent = await requireOwnedAgent(orgId, agentId, acting.userId, acting.permissions);
      const creatorPermissions = await deps.resolveCreatorPermissions(
        acting.userId,
        acting.userToken,
      );
      const permissions = intersectAgentPermissions(creatorPermissions, requestedPermissions);
      if (permissions.length === 0) {
        throw new ValidationError("permissions", "Agent token would have no delegated permissions");
      }
      const issuer = process.env.ZITADEL_ISSUER?.trim() ?? "http://localhost:8080";
      const projectId = process.env.ZITADEL_PROJECT_ID?.trim() ?? "";
      const clientId = process.env.ZITADEL_AGENT_CLIENT_ID?.trim() ?? "";
      const clientSecret = process.env.ZITADEL_AGENT_CLIENT_SECRET?.trim() ?? "";
      if (!projectId || !clientId || !clientSecret) {
        throw new ServiceUnavailableError(
          "ZITADEL agent exchange is not configured (project/client credentials)",
        );
      }

      const actorKey = await ensureAgentActor(
        orgId,
        agent,
        deps.storage.setZitadelAgentUserId,
      );
      const actor = await serviceAccountToken({
        issuer,
        key: actorKey,
        scopes: `openid urn:zitadel:iam:org:project:id:${projectId}:aud`,
      });
      const exchanged = await exchangeDelegatedToken({
        issuer,
        clientId,
        clientSecret,
        actorToken: actor.accessToken,
        subjectToken: acting.userToken,
        requestedTokenType: "urn:ietf:params:oauth:token-type:jwt",
        audience: projectId,
      });

      const exp = Math.floor(Date.now() / 1000) + exchanged.expiresIn;
      return { token: exchanged.accessToken, expiresAt: exp, permissions };
    },

    async grantCollectionEditor(
      orgId: string,
      agentId: string,
      collectionSlug: string,
      acting: { userId: string; userToken: string; permissions: PermissionKey[] },
    ): Promise<void> {
      const agent = await requireOwnedAgent(orgId, agentId, acting.userId, acting.permissions);
      const creatorPermissions = await deps.resolveCreatorPermissions(
        acting.userId,
        acting.userToken,
      );
      await assertCreatorScope(
        orgId,
        acting.userId,
        creatorPermissions,
        "Collection",
        collectionSlug,
      );
      await deps.authorization.grant({
        namespace: "Collection",
        objectId: collectionSlug,
        relation: "editors",
        subject: { type: "Agent", id: agent.slug },
      });
    },

    async grantDocumentEditor(
      orgId: string,
      agentId: string,
      documentId: string,
      acting: { userId: string; userToken: string; permissions: PermissionKey[] },
    ): Promise<void> {
      const agent = await requireOwnedAgent(orgId, agentId, acting.userId, acting.permissions);
      const creatorPermissions = await deps.resolveCreatorPermissions(
        acting.userId,
        acting.userToken,
      );
      await assertCreatorScope(orgId, acting.userId, creatorPermissions, "Document", documentId);
      await deps.authorization.grant({
        namespace: "Document",
        objectId: documentId,
        relation: "editors",
        subject: { type: "Agent", id: agent.slug },
      });
    },
  };
}

export type AgentRegistryService = ReturnType<typeof createAgentRegistryService>;
