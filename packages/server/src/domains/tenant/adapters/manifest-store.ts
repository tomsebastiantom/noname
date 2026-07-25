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
  get(tenantId: string): Promise<CatalogManifest | null>;
  set(tenantId: string, manifest: CatalogManifest): Promise<void>;
  addComponent(tenantId: string, entry: CatalogManifestRemote): Promise<void>;
  removeComponent(tenantId: string, name: string): Promise<void>;
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
    async get(tenantId) {
      return manifests.get(tenantId) ?? null;
    },
    async set(tenantId, manifest) {
      manifests.set(tenantId, manifest);
    },
    async addComponent(tenantId, entry) {
      const manifest = manifests.get(tenantId);
      if (!manifest) {
        manifests.set(tenantId, {
          platform: { version: "1", hash: "init" },
          private: entry,
        });
      } else {
        manifest.private = entry;
        manifests.set(tenantId, manifest);
      }
    },
    async removeComponent(tenantId, _name) {
      const manifest = manifests.get(tenantId);
      if (manifest) {
        manifest.private = undefined;
        manifests.set(tenantId, manifest);
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
