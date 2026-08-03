/**
 * Noname Zanzibar model for Ory Keto (OPL).
 * Tags = access buckets; Teams = people groups; Postgres owns doc ↔ tag labels.
 * Spec: docs/2026-08-03/ACCESS-AND-ROLES.md
 */
import { Namespace, Context, SubjectSet } from "@ory/keto-namespace-types";

class User implements Namespace {}

class Agent implements Namespace {
  related: {
    owners: User[];
  };
}

class Store implements Namespace {
  related: {
    owners: User[];
    admins: User[];
    editors: (User | Agent | SubjectSet<Store, "editors">)[];
    viewers: (User | Agent | SubjectSet<Store, "viewers">)[];
  };

  permits = {
    view: (ctx: Context): boolean =>
      this.related.viewers.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject) ||
      this.related.admins.includes(ctx.subject) ||
      this.related.owners.includes(ctx.subject),
    edit: (ctx: Context): boolean =>
      this.related.editors.includes(ctx.subject) ||
      this.related.admins.includes(ctx.subject) ||
      this.related.owners.includes(ctx.subject),
    admin: (ctx: Context): boolean =>
      this.related.admins.includes(ctx.subject) ||
      this.related.owners.includes(ctx.subject),
  };
}

class Team implements Namespace {
  related: {
    editors: (User | Agent)[];
    publishers: (User | Agent)[];
  };

  permits = {
    edit: (ctx: Context): boolean => this.related.editors.includes(ctx.subject),
    publish: (ctx: Context): boolean => this.related.publishers.includes(ctx.subject),
  };
}

class Tag implements Namespace {
  related: {
    editors: (User | Agent | SubjectSet<Team, "editors">)[];
    publishers: (User | Agent | SubjectSet<Team, "publishers">)[];
  };

  permits = {
    view: (ctx: Context): boolean =>
      this.related.editors.includes(ctx.subject) ||
      this.related.publishers.includes(ctx.subject),
    edit: (ctx: Context): boolean => this.related.editors.includes(ctx.subject),
    publish: (ctx: Context): boolean => this.related.publishers.includes(ctx.subject),
  };
}

class Collection implements Namespace {
  related: {
    parents: Collection[];
    editors: (User | Agent | SubjectSet<Team, "editors">)[];
    viewers: (User | Agent | SubjectSet<Team, "editors">)[];
  };

  permits = {
    view: (ctx: Context): boolean =>
      this.related.viewers.includes(ctx.subject) ||
      this.related.parents.traverse((p) => p.permits.view(ctx)),
    edit: (ctx: Context): boolean =>
      this.related.editors.includes(ctx.subject) ||
      this.related.parents.traverse((p) => p.permits.edit(ctx)),
  };
}

class Document implements Namespace {
  related: {
    parents: Collection[];
    owners: User[];
    editors: (User | Agent | SubjectSet<Store, "editors">)[];
    publishers: (User | Agent | SubjectSet<Store, "editors">)[];
    viewers: (User | Agent | SubjectSet<Store, "viewers">)[];
  };

  permits = {
    view: (ctx: Context): boolean =>
      this.related.viewers.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject) ||
      this.related.publishers.includes(ctx.subject) ||
      this.related.owners.includes(ctx.subject) ||
      this.related.parents.traverse((p) => p.permits.view(ctx)),
    edit: (ctx: Context): boolean =>
      this.related.editors.includes(ctx.subject) ||
      this.related.owners.includes(ctx.subject) ||
      this.related.parents.traverse((p) => p.permits.edit(ctx)),
    publish: (ctx: Context): boolean =>
      this.related.publishers.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject) ||
      this.related.owners.includes(ctx.subject),
  };
}
