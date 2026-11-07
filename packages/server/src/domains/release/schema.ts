import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const releaseState = pgEnum("release_state", ["building", "ready", "retired"]);

export const releaseArtifactKind = pgEnum("release_artifact_kind", [
  "client_bundle",
  "server_image",
  "worker_image",
  "migration_set",
  "config",
]);

/**
 * A release is the immutable binding of every artifact that ships together (D14).
 *
 * It is deliberately *not* a deployment: the server selector and the tenant pointer are separate
 * switches. A release record only says “these exact artifacts were built and verified together”.
 */
export const releases = pgTable(
  "releases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    platformVersion: text("platform_version").notNull(),
    checksVersion: text("checks_version").notNull(),
    state: releaseState("state").notNull().default("building"),
    createdBy: text("created_by").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    orgState: index("releases_org_state").on(t.orgId, t.state),
    orgCreated: index("releases_org_created").on(t.orgId, t.created_at),
  }),
);

export const releaseArtifacts = pgTable(
  "release_artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    releaseId: uuid("release_id")
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    kind: releaseArtifactKind("kind").notNull(),
    /** Immutable locator, e.g. an R2 key, an image reference, or a migration set id. */
    ref: text("ref").notNull(),
    /** Content digest, so the same release can be proven from storage rather than trusted from the ref. */
    digest: text("digest").notNull(),
    created_at: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    releaseKind: uniqueIndex("release_artifacts_release_kind").on(t.releaseId, t.kind),
  }),
);

/**
 * D15 — which release each environment serves.
 *
 * `activeReleaseId` is the blue/green selector; `previousReleaseId` is what rollback returns to. The row is the
 * only state a deployment needs to read; the release domain never touches pods or ingress.
 */
export const releaseEnvironments = pgTable(
  "release_environments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orgId: text("org_id").notNull(),
    name: text("name").notNull(),
    activeReleaseId: uuid("active_release_id").references(() => releases.id),
    previousReleaseId: uuid("previous_release_id").references(() => releases.id),
    updatedBy: text("updated_by").notNull(),
    updated_at: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    orgName: uniqueIndex("release_environments_org_name").on(t.orgId, t.name),
  }),
);
