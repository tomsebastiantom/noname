import { and, eq } from "drizzle-orm";
import type { Database } from "../../../drizzle";
import { NotFoundError, ValidationError } from "../../../shared/domain-error";
import { registeredAgents, agentTokenGrants } from "../schema";

export interface RegisteredAgentRow {
  id: string;
  orgId: string;
  slug: string;
  label: string;
  ownerUserId: string;
  zitadelAgentUserId: string | null;
  allowedTools: string[];
  createdAt: Date;
}

function normalizeSlug(raw: string): string {
  const slug = raw.trim().toLowerCase();
  if (!slug) throw new ValidationError("slug", "Invalid slug");
  return slug;
}

function rowToDto(row: typeof registeredAgents.$inferSelect): RegisteredAgentRow {
  const tools = row.allowedTools;
  return {
    id: row.id,
    orgId: row.orgId,
    slug: row.slug,
    label: row.label,
    ownerUserId: row.ownerUserId,
    zitadelAgentUserId: row.zitadelAgentUserId ?? null,
    allowedTools: Array.isArray(tools)
      ? tools.filter((entry): entry is string => typeof entry === "string")
      : [],
    createdAt: row.created_at,
  };
}

export interface AgentTokenGrantRow {
  jti: string;
  agentId: string;
  permissions: string[];
  expiresAt: Date;
}

export function createAgentRegistryStorage(db: Database) {
  return {
    async create(input: {
      orgId: string;
      slug: string;
      label: string;
      ownerUserId: string;
      allowedTools?: string[];
    }): Promise<RegisteredAgentRow> {
      const slug = normalizeSlug(input.slug);
      const [row] = await db
        .insert(registeredAgents)
        .values({
          orgId: input.orgId,
          slug,
          label: input.label.trim() || slug,
          ownerUserId: input.ownerUserId,
          allowedTools: input.allowedTools ?? [],
        })
        .returning();
      if (!row) throw new ValidationError("slug", "Failed to create agent");
      return rowToDto(row);
    },

    async list(orgId: string): Promise<RegisteredAgentRow[]> {
      const rows = await db
        .select()
        .from(registeredAgents)
        .where(eq(registeredAgents.orgId, orgId));
      return rows.map(rowToDto).sort((a, b) => a.slug.localeCompare(b.slug));
    },

    async findById(orgId: string, id: string): Promise<RegisteredAgentRow | null> {
      const [row] = await db
        .select()
        .from(registeredAgents)
        .where(and(eq(registeredAgents.orgId, orgId), eq(registeredAgents.id, id)))
        .limit(1);
      return row ? rowToDto(row) : null;
    },

    async findByZitadelAgentUserId(
      orgId: string,
      zitadelAgentUserId: string,
    ): Promise<RegisteredAgentRow | null> {
      const [row] = await db
        .select()
        .from(registeredAgents)
        .where(
          and(
            eq(registeredAgents.orgId, orgId),
            eq(registeredAgents.zitadelAgentUserId, zitadelAgentUserId),
          ),
        )
        .limit(1);
      return row ? rowToDto(row) : null;
    },

    async findBySlug(orgId: string, slug: string): Promise<RegisteredAgentRow | null> {
      const normalized = normalizeSlug(slug);
      const [row] = await db
        .select()
        .from(registeredAgents)
        .where(and(eq(registeredAgents.orgId, orgId), eq(registeredAgents.slug, normalized)))
        .limit(1);
      return row ? rowToDto(row) : null;
    },

    async setZitadelAgentUserId(
      orgId: string,
      id: string,
      zitadelAgentUserId: string,
    ): Promise<void> {
      await db
        .update(registeredAgents)
        .set({ zitadelAgentUserId })
        .where(and(eq(registeredAgents.orgId, orgId), eq(registeredAgents.id, id)));
    },

    async createTokenGrant(input: {
      jti: string;
      orgId: string;
      agentId: string;
      permissions: string[];
      expiresAt: Date;
    }): Promise<void> {
      await db
        .insert(agentTokenGrants)
        .values(input)
        .onConflictDoNothing();
    },

    async findTokenGrant(orgId: string, jti: string): Promise<AgentTokenGrantRow | null> {
      const [row] = await db
        .select()
        .from(agentTokenGrants)
        .where(and(eq(agentTokenGrants.orgId, orgId), eq(agentTokenGrants.jti, jti)))
        .limit(1);
      if (!row || row.expiresAt.getTime() <= Date.now()) return null;
      return {
        jti: row.jti,
        agentId: row.agentId,
        permissions: Array.isArray(row.permissions)
          ? row.permissions.filter((entry): entry is string => typeof entry === "string")
          : [],
        expiresAt: row.expiresAt,
      };
    },

    async deleteTokenGrants(orgId: string, agentId: string): Promise<void> {
      await db
        .delete(agentTokenGrants)
        .where(and(eq(agentTokenGrants.orgId, orgId), eq(agentTokenGrants.agentId, agentId)));
    },

    async delete(orgId: string, id: string): Promise<void> {
      const existing = await this.findById(orgId, id);
      if (!existing) throw new NotFoundError("Agent", id);
      await db
        .delete(registeredAgents)
        .where(and(eq(registeredAgents.orgId, orgId), eq(registeredAgents.id, id)));
    },
  };
}

export type AgentRegistryStorage = ReturnType<typeof createAgentRegistryStorage>;
