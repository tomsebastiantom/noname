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
