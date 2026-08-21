import { and, eq } from "drizzle-orm";
import { contentTeams } from "../../documents/schema";
import type { ScopeDeps } from "./deps";
import {
  assertTeamSlotRole,
  ensureTeamExists,
  revokeAllTeamTuples,
  slugOrThrow,
  type TeamMemberEntry,
} from "./helpers";

export function createTeamOps(deps: ScopeDeps) {
  return {
    async listTeams(orgId: string): Promise<{ slug: string; label: string }[]> {
      const rows = await deps.db.select().from(contentTeams).where(eq(contentTeams.orgId, orgId));
      return rows
        .map((r) => ({ slug: r.slug, label: r.label }))
        .sort((a, b) => a.slug.localeCompare(b.slug));
    },

    async createTeam(orgId: string, slug: string, label: string): Promise<void> {
      const normalized = slugOrThrow(slug, "slug");
      const trimmedLabel = label.trim() || normalized;
      await deps.db
        .insert(contentTeams)
        .values({
          orgId,
          slug: normalized,
          label: trimmedLabel,
        })
        .onConflictDoUpdate({
          target: [contentTeams.orgId, contentTeams.slug],
          set: { label: trimmedLabel },
        });
    },

    async deleteTeam(orgId: string, slug: string): Promise<void> {
      const teamSlug = slugOrThrow(slug, "team");
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await revokeAllTeamTuples(deps.tupleReader, deps.tupleWriter, teamSlug);
      await deps.db
        .delete(contentTeams)
        .where(and(eq(contentTeams.orgId, orgId), eq(contentTeams.slug, teamSlug)));
    },

    async grantTeamEditor(orgId: string, team: string, userId: string): Promise<void> {
      const teamSlug = slugOrThrow(team, "team");
      await assertTeamSlotRole(deps.resolveUserStaffRole, orgId, userId, "editors");
      await deps.tupleWriter.grant({
        namespace: "Team",
        objectId: teamSlug,
        relation: "editors",
        subject: { type: "User", id: userId },
      });
    },

    async revokeTeamEditor(_orgId: string, team: string, userId: string): Promise<void> {
      const teamSlug = slugOrThrow(team, "team");
      await deps.tupleWriter.revoke({
        namespace: "Team",
        objectId: teamSlug,
        relation: "editors",
        subject: { type: "User", id: userId },
      });
    },

    async grantTeamPublisher(orgId: string, team: string, userId: string): Promise<void> {
      const teamSlug = slugOrThrow(team, "team");
      await assertTeamSlotRole(deps.resolveUserStaffRole, orgId, userId, "publishers");
      await deps.tupleWriter.grant({
        namespace: "Team",
        objectId: teamSlug,
        relation: "publishers",
        subject: { type: "User", id: userId },
      });
    },

    async revokeTeamPublisher(_orgId: string, team: string, userId: string): Promise<void> {
      const teamSlug = slugOrThrow(team, "team");
      await deps.tupleWriter.revoke({
        namespace: "Team",
        objectId: teamSlug,
        relation: "publishers",
        subject: { type: "User", id: userId },
      });
    },

    async listTeamMembers(orgId: string, team: string): Promise<TeamMemberEntry[]> {
      const teamSlug = slugOrThrow(team, "team");
      await ensureTeamExists(deps.db, orgId, teamSlug);
      const [editorUsers, publisherUsers] = await Promise.all([
        deps.tupleReader.listDirectUserEditors("Team", teamSlug),
        deps.tupleReader.listDirectUserPublishers("Team", teamSlug),
      ]);
      const memberMap = new Map<string, TeamMemberEntry>();
      for (const user of editorUsers) {
        let entry = memberMap.get(user.id);
        if (!entry) {
          entry = { userId: user.id, editors: false, publishers: false };
          memberMap.set(user.id, entry);
        }
        entry.editors = true;
      }
      for (const user of publisherUsers) {
        let entry = memberMap.get(user.id);
        if (!entry) {
          entry = { userId: user.id, editors: false, publishers: false };
          memberMap.set(user.id, entry);
        }
        entry.publishers = true;
      }
      return [...memberMap.values()].sort((a, b) => a.userId.localeCompare(b.userId));
    },
  };
}
