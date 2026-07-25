export interface CatalogManifestRemote {
  name: string;
  url: string;
  hash: string;
  version: number;
}

export interface CatalogManifest {
  platform: { version: string; hash: string };
  /** Built-in vertical packs enabled for this org (e.g. "commerce"). */
  verticals?: string[];
  private?: CatalogManifestRemote;
  marketplace?: CatalogManifestRemote[];
}

export interface BuildStatus {
  status: "pending" | "running" | "completed" | "failed";
  result?: {
    remoteEntry?: { filename: string; url: string };
    hash?: string;
    error?: string;
  };
}

export interface TenantCatalogService {
  getManifest(orgId: string): Promise<CatalogManifest>;
  setManifest(orgId: string, manifest: CatalogManifest): Promise<void>;
  /** Enqueue a catalog build job. Returns the build ID for status polling. */
  publishComponent(orgId: string, name: string, source: string): Promise<{ buildId: string }>;
  /** Check the status of a catalog build. */
  getBuildStatus(orgId: string, buildId: string): Promise<BuildStatus | null>;
  removeComponent(orgId: string, name: string): Promise<void>;
}
