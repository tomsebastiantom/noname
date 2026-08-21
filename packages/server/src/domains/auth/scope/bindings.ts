import { eq } from "drizzle-orm";
import { contentCollections, contentTeams } from "../../documents/schema";
import type { ScopeDeps } from "./deps";
import {
  type CollectionAgentBinding,
  type CollectionTeamBinding,
  ensureCollectionExists,
  ensureTeamExists,
  slugOrThrow,
} from "./helpers";

export function createBindingOps(deps: ScopeDeps) {
  return {
    async listCollectionTeamBindings(orgId: string): Promise<CollectionTeamBinding[]> {
      const [collections, teams] = await Promise.all([
        deps.db.select().from(contentCollections).where(eq(contentCollections.orgId, orgId)),
        deps.db.select().from(contentTeams).where(eq(contentTeams.orgId, orgId)),
      ]);
      const teamSlugs = new Set(teams.map((row) => row.slug));
      const bindingMap = new Map<string, CollectionTeamBinding>();

      for (const collection of collections) {
        const tuples = await deps.tupleReader.listRelationTuples({
          namespace: "Collection",
          objectId: collection.slug,
        });
        for (const tuple of tuples) {
          if (tuple.subject.type !== "Team" || !teamSlugs.has(tuple.subject.id)) continue;
          const key = `${collection.slug}\0${tuple.subject.id}`;
          let binding = bindingMap.get(key);
          if (!binding) {
            binding = {
              collection: collection.slug,
              team: tuple.subject.id,
              editors: false,
              publishers: false,
            };
            bindingMap.set(key, binding);
          }
          if (tuple.relation === "editors") binding.editors = true;
          if (tuple.relation === "publishers") binding.publishers = true;
        }
      }

      return [...bindingMap.values()].sort((a, b) => {
        const byCollection = a.collection.localeCompare(b.collection);
        if (byCollection !== 0) return byCollection;
        return a.team.localeCompare(b.team);
      });
    },

    async listCollectionAgentBindings(orgId: string): Promise<CollectionAgentBinding[]> {
      const collections = await deps.db
        .select()
        .from(contentCollections)
        .where(eq(contentCollections.orgId, orgId));
      const bindings: CollectionAgentBinding[] = [];

      for (const collection of collections) {
        const tuples = await deps.tupleReader.listRelationTuples({
          namespace: "Collection",
          objectId: collection.slug,
        });
        for (const tuple of tuples) {
          if (tuple.subject.type !== "Agent" || tuple.relation !== "editors") continue;
          bindings.push({ collection: collection.slug, agent: tuple.subject.id });
        }
      }

      return bindings.sort((a, b) => {
        const byCollection = a.collection.localeCompare(b.collection);
        if (byCollection !== 0) return byCollection;
        return a.agent.localeCompare(b.agent);
      });
    },

    async unbindCollectionAgentEditors(
      orgId: string,
      collection: string,
      agentSlug: string,
    ): Promise<void> {
      const collectionSlug = slugOrThrow(collection, "collection");
      const agent = slugOrThrow(agentSlug, "agent");
      await ensureCollectionExists(deps.db, orgId, collectionSlug);
      await deps.tupleWriter.revoke({
        namespace: "Collection",
        objectId: collectionSlug,
        relation: "editors",
        subject: { type: "Agent", id: agent },
      });
    },

    async bindCollectionTeamEditors(
      orgId: string,
      collection: string,
      team: string,
    ): Promise<void> {
      const collectionSlug = slugOrThrow(collection, "collection");
      const teamSlug = slugOrThrow(team, "team");
      await ensureCollectionExists(deps.db, orgId, collectionSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.grant({
        namespace: "Collection",
        objectId: collectionSlug,
        relation: "editors",
        subject: { type: "Team", id: teamSlug, relation: "editors" },
      });
    },

    async bindCollectionTeamPublishers(
      orgId: string,
      collection: string,
      team: string,
    ): Promise<void> {
      const collectionSlug = slugOrThrow(collection, "collection");
      const teamSlug = slugOrThrow(team, "team");
      await ensureCollectionExists(deps.db, orgId, collectionSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.grant({
        namespace: "Collection",
        objectId: collectionSlug,
        relation: "publishers",
        subject: { type: "Team", id: teamSlug, relation: "publishers" },
      });
    },

    async unbindCollectionTeamEditors(
      orgId: string,
      collection: string,
      team: string,
    ): Promise<void> {
      const collectionSlug = slugOrThrow(collection, "collection");
      const teamSlug = slugOrThrow(team, "team");
      await ensureCollectionExists(deps.db, orgId, collectionSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.revoke({
        namespace: "Collection",
        objectId: collectionSlug,
        relation: "editors",
        subject: { type: "Team", id: teamSlug, relation: "editors" },
      });
    },

    async unbindCollectionTeamPublishers(
      orgId: string,
      collection: string,
      team: string,
    ): Promise<void> {
      const collectionSlug = slugOrThrow(collection, "collection");
      const teamSlug = slugOrThrow(team, "team");
      await ensureCollectionExists(deps.db, orgId, collectionSlug);
      await ensureTeamExists(deps.db, orgId, teamSlug);
      await deps.tupleWriter.revoke({
        namespace: "Collection",
        objectId: collectionSlug,
        relation: "publishers",
        subject: { type: "Team", id: teamSlug, relation: "publishers" },
      });
    },
  };
}
