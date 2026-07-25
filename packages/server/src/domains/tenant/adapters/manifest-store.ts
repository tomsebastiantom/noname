import type { CatalogManifest, CatalogManifestRemote } from "../ports";

export interface BuildStatus {
  status: "pending" | "running" | "completed" | "failed";
  result?: {
    remoteEntry?: { filename: string; url: string };
    hash?: string;
    error?: string;
  };
}

export interface ManifestStore {
  get(orgId: string): Promise<CatalogManifest | null>;
  set(orgId: string, manifest: CatalogManifest): Promise<void>;
  addComponent(orgId: string, entry: CatalogManifestRemote): Promise<void>;
  removeComponent(orgId: string, name: string): Promise<void>;
  setBuildStatus(
    buildId: string,
    status: BuildStatus["status"],
    result?: BuildStatus["result"],
  ): Promise<void>;
  getBuildStatus(buildId: string): Promise<BuildStatus | null>;
}

export function createInMemoryManifestStore(): ManifestStore {
  const manifests = new Map<string, CatalogManifest>();
  const builds = new Map<string, BuildStatus>();

  return {
    async get(orgId) {
      return manifests.get(orgId) ?? null;
    },
    async set(orgId, manifest) {
      manifests.set(orgId, manifest);
    },
    async addComponent(orgId, entry) {
      const manifest = manifests.get(orgId);
      if (!manifest) {
        manifests.set(orgId, {
          platform: { version: "1", hash: "init" },
          verticals: [],
          private: entry,
        });
      } else {
        manifest.private = entry;
        manifests.set(orgId, manifest);
      }
    },
    async removeComponent(orgId, _name) {
      const manifest = manifests.get(orgId);
      if (manifest) {
        manifest.private = undefined;
        manifests.set(orgId, manifest);
      }
    },
    async setBuildStatus(buildId, status, result) {
      builds.set(buildId, { status, result });
    },
    async getBuildStatus(buildId) {
      return builds.get(buildId) ?? null;
    },
  };
}
