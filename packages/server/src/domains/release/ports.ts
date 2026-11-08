export type ReleaseState = "building" | "ready" | "retired";

export type ReleaseArtifactKind =
  | "client_bundle"
  | "server_image"
  | "worker_image"
  | "migration_set"
  | "config";

export type ReleaseArtifactInput = {
  kind: ReleaseArtifactKind;
  ref: string;
  digest: string;
};

export type ReleaseArtifact = ReleaseArtifactInput & {
  id: string;
  releaseId: string;
  createdAt: Date;
};

export type ReleaseDTO = {
  id: string;
  orgId: string;
  platformVersion: string;
  checksVersion: string;
  state: ReleaseState;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  artifacts: ReleaseArtifact[];
};

export type CreateReleaseInput = {
  platformVersion: string;
  checksVersion: string;
  artifacts: ReleaseArtifactInput[];
};

export interface ReleaseStore {
  create(orgId: string, input: CreateReleaseInput, createdBy: string): Promise<ReleaseDTO>;
  findById(orgId: string, id: string): Promise<ReleaseDTO | null>;
  /** Platform lookup: a release may be owned by the platform org while a tenant points at it. */
  findByIdAnyOrg(id: string): Promise<ReleaseDTO | null>;
  list(orgId: string): Promise<ReleaseDTO[]>;
  updateState(orgId: string, id: string, state: ReleaseState): Promise<ReleaseDTO>;
  /** Deletes the given releases (artifacts cascade) and returns the ids actually removed. */
  delete(orgId: string, ids: string[]): Promise<string[]>;
}

export interface ReleaseService {
  create(orgId: string, input: CreateReleaseInput, createdBy: string): Promise<ReleaseDTO>;
  get(orgId: string, id: string): Promise<ReleaseDTO>;
  /** Lookup by id across orgs, for platform operations only. */
  getAnyOrg(id: string): Promise<ReleaseDTO>;
  list(orgId: string): Promise<ReleaseDTO[]>;
  markReady(orgId: string, id: string): Promise<ReleaseDTO>;
}

export type ReleaseEnvironmentDTO = {
  id: string;
  orgId: string;
  name: string;
  activeReleaseId: string | null;
  previousReleaseId: string | null;
  updatedBy: string;
  updatedAt: Date;
};

export interface EnvironmentStore {
  get(orgId: string, name: string): Promise<ReleaseEnvironmentDTO | null>;
  list(orgId: string): Promise<ReleaseEnvironmentDTO[]>;
  setActive(
    orgId: string,
    name: string,
    activeReleaseId: string,
    previousReleaseId: string | null,
    updatedBy: string,
  ): Promise<ReleaseEnvironmentDTO>;
}

export interface EnvironmentService {
  preview(orgId: string, releaseId: string, actor: string): Promise<ReleaseEnvironmentDTO>;
  activate(
    orgId: string,
    releaseId: string,
    environment: string,
    actor: string,
  ): Promise<ReleaseEnvironmentDTO>;
  rollback(orgId: string, environment: string, actor: string): Promise<ReleaseEnvironmentDTO>;
  list(orgId: string): Promise<ReleaseEnvironmentDTO[]>;
}

export type TenantReleasePointerDTO = {
  orgId: string;
  releaseId: string;
  previousReleaseId: string | null;
  /** D3 ring; when set it wins over releaseId on catalog reads. */
  channel: string | null;
  updatedBy: string;
  updatedAt: Date;
};

export type ClientBundleRef = {
  releaseId: string;
  url: string;
  hash: string;
  version: string;
};

export interface PointerStore {
  get(orgId: string): Promise<TenantReleasePointerDTO | null>;
  set(
    orgId: string,
    releaseId: string,
    previousReleaseId: string | null,
    updatedBy: string,
    channel?: string | null,
  ): Promise<TenantReleasePointerDTO>;
}

export type ReleaseChannelDTO = {
  id: string;
  orgId: string;
  channel: string;
  releaseId: string;
  previousReleaseId: string | null;
  updatedBy: string;
  updatedAt: Date;
};

export interface ChannelStore {
  get(orgId: string, channel: string): Promise<ReleaseChannelDTO | null>;
  list(orgId: string): Promise<ReleaseChannelDTO[]>;
  set(
    orgId: string,
    channel: string,
    releaseId: string,
    previousReleaseId: string | null,
    updatedBy: string,
  ): Promise<ReleaseChannelDTO>;
}

export interface ChannelService {
  list(orgId: string): Promise<ReleaseChannelDTO[]>;
  get(orgId: string, channel: string): Promise<ReleaseChannelDTO>;
  activate(
    orgId: string,
    channel: string,
    releaseId: string,
    actor: string,
  ): Promise<ReleaseChannelDTO>;
  rollback(orgId: string, channel: string, actor: string): Promise<ReleaseChannelDTO>;
}

export interface ReleasePointerService {
  get(orgId: string): Promise<TenantReleasePointerDTO | null>;
  promote(orgId: string, releaseId: string, actor: string): Promise<TenantReleasePointerDTO>;
  rollback(orgId: string, actor: string): Promise<TenantReleasePointerDTO>;
  /** Put the tenant in a channel ring; the channel must exist. */
  assignChannel(orgId: string, channel: string, actor: string): Promise<TenantReleasePointerDTO>;
  /** Leave the ring and pin to the pointer's current release. */
  clearChannel(orgId: string, actor: string): Promise<TenantReleasePointerDTO>;
  /** Null means “no pointer or no client bundle” — the catalog then keeps its stored manifest. */
  clientBundle(orgId: string): Promise<ClientBundleRef | null>;
}

export interface ReleaseRetention {
  /** Keep the newest `keep` releases plus anything currently pointed at or active/previous. */
  prune(orgId: string, keep?: number): Promise<{ deleted: string[] }>;
}
