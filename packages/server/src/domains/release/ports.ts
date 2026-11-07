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
  list(orgId: string): Promise<ReleaseDTO[]>;
  updateState(orgId: string, id: string, state: ReleaseState): Promise<ReleaseDTO>;
}

export interface ReleaseService {
  create(orgId: string, input: CreateReleaseInput, createdBy: string): Promise<ReleaseDTO>;
  get(orgId: string, id: string): Promise<ReleaseDTO>;
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
  ): Promise<TenantReleasePointerDTO>;
}

export interface ReleasePointerService {
  get(orgId: string): Promise<TenantReleasePointerDTO | null>;
  promote(orgId: string, releaseId: string, actor: string): Promise<TenantReleasePointerDTO>;
  rollback(orgId: string, actor: string): Promise<TenantReleasePointerDTO>;
  /** Null means “no pointer or no client bundle” — the catalog then keeps its stored manifest. */
  clientBundle(orgId: string): Promise<ClientBundleRef | null>;
}
